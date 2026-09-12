import SwiftUI
import Observation
import UserNotifications
import AVFoundation

enum GameScreen: String { case loading, menu, calibrate, playing, paused, gameover, store, settings, boards, honors, lore, history, report, goals, duel }
@MainActor @Observable final class SlouchModel: NSObject {
    var screen: GameScreen = .loading
    var menu: JSONValue = .null
    var catalog: JSONValue = .null
    var hud: JSONValue = .null
    var report: JSONValue = .null
    var weeklyTrend: Double?
    var renderer: WorldRenderer?
    let tracker = HeadTracker()
    var toast = ""
    var error: String?
    var countdown = ""
    var tag = "ACE"
    var selectedMode = "techneck"
    var duel: JSONValue = .null
    var isBusy = false
    private var kernel: GameKernel?
    private var audio: GameAudio?
    private var displayLink: CADisplayLink?
    private var frames = 0
    private var toastDeadline: Double = 0
    private var returningFromReport: GameScreen = .gameover
    private var countdownTask: Task<Void,Never>?
    private var calibrationResumesRun = false
    private var calibrationStable = 0.0
    var save: JSONValue { menu["save"] }
    var world: String { save["equippedWorld"].string.isEmpty ? "space":save["equippedWorld"].string }
    var backgroundColor: Color { Color(uiColor:UIColor(hex:world == "ocean" ? 0x04222e:world == "jungle" ? 0x10240c:0x05070e)) }
    var muted: Color { Color(uiColor:UIColor(hex:world == "ocean" ? 0x6b93a8:world == "jungle" ? 0x7fa06b:0x5c6a8a)) }
    var hot: Color { Color(uiColor:UIColor(hex:world == "jungle" ? 0xff8a3c:0xff4d6d)) }
    var accent: Color { Color(uiColor:UIColor(hex:world == "space" ? catalog["THEMES"][save["equippedTheme"].string]["colors"]["accent"].int:catalog["PACKS"][world]["env"]["accent"].int)) }
    var displayFont: String { world == "ocean" ? "Fredoka-Regular":world == "jungle" ? "Baloo2-Regular":"ZenDots-Regular" }
    var text: JSONValue { catalog["WORLD_TEXT"][world] }
    func boot() async {
        guard kernel == nil else{return}
        do {
            let resources=Bundle.main.resourceURL!.appendingPathComponent("GameResources")
            #if DEBUG
            let arguments=ProcessInfo.processInfo.arguments
            let qa=arguments.contains{$0.hasPrefix("-qa-")}
            let saveDirectory=qa ? "SlouchQA":"Slouch"
            #else
            let saveDirectory="Slouch"
            #endif
            let saves=FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent(saveDirectory+"/slouch.save.v1.json")
            kernel=try GameKernel(resources:resources,saveURL:saves)
            #if DEBUG
            if qa {
                kernel!.context.evaluateScript("require('state').resetAll();require('state').addPoints(20000)")
                let target=arguments.first{$0.hasPrefix("-qa-world=")}?.components(separatedBy:"=").last ?? "space"
                if ["ocean","jungle"].contains(target) {try kernel!.call("buy",["world_"+target]);try kernel!.call("equip",["world_"+target])}
                if let hero=arguments.first(where:{$0.hasPrefix("-qa-hero=")})?.components(separatedBy:"=").last,
                   ["hero_pig","hero_bunny","hero_tang","hero_mandarin","hero_clown"].contains(hero) {
                    try kernel!.call("buy",[hero]);try kernel!.call("equip",[hero])
                }
            }
            #endif
            catalog=kernel!.catalog;refresh()
            renderer=try WorldRenderer(resources:resources);renderer?.configure(save:save,catalog:catalog)
            renderer?.onError = { [weak self] value in self?.fail(value) }
            audio=GameAudio(root:Bundle.main.resourceURL!.appendingPathComponent("assets"));audio?.volumes(save["settings"])
            tag=save["lastTag"].string
            let proxy=DisplayLinkProxy();proxy.owner=self
            displayLink=CADisplayLink(target:proxy,selector:#selector(DisplayLinkProxy.tick(_:)))
            displayLink?.preferredFrameRateRange=CAFrameRateRange(minimum:30,maximum:60,preferred:60)
            displayLink?.add(to:.main,forMode:.common)
            screen = .menu
            #if DEBUG
            if arguments.contains("-touch") {tracker.enableTouch()}
            if arguments.contains("-qa-autoplay") {tracker.enableTouch();launch();perform("debug",["god"])}
            #endif
        } catch {fail(error.localizedDescription)}
    }
    func refresh() {
        guard let kernel else{return}
        do {menu=try kernel.json("menu");renderer?.configure(save:save,catalog:catalog);audio?.volumes(save["settings"])}
        catch {fail(error.localizedDescription)}
    }
    func perform(_ name: String,_ args:[Any]=[]) {
        do {try kernel?.call(name,args)} catch {fail(error.localizedDescription)}
    }
    func tick(_ link: CADisplayLink) {
        guard let kernel,error == nil else{return}
        if screen == .calibrate && !isBusy && tracker.ready {
            if tracker.hasFace {
                calibrationStable += min(0.05,link.targetTimestamp-link.timestamp)
                countdown=String(repeating:"·",count:1+min(2,Int(calibrationStable*4)))
                if calibrationStable>=0.7 {calibrationStable=0;calibration()}
            } else {calibrationStable=0;countdown=""}
        }
        do {
            let frame=try kernel.tick(milliseconds:link.timestamp*1000,pose:tracker.pose)
            renderer?.update(frame,realTime:link.timestamp)
            frames += 1
            if frames%3 == 0 {hud=frame.ui}
            audio?.intensity(frame.ui["intensity"].number)
            for event in frame.events {
                switch event.kind {
                case "toast":toast=event.data.string;toastDeadline=link.timestamp+2.2
                case "sound":audio?.sound(event.data["file"].string,gain:Float(event.data["gain"].number),rate:Float(event.data["rate"].number))
                case "music":audio?.event(event.data.string)
                case "haptic":UIImpactFeedbackGenerator(style:.light).impactOccurred()
                case "gameover":refresh();screen = .gameover;audio?.musicFor(world:world,running:false);UIApplication.shared.isIdleTimerDisabled=false
                default:break
                }
            }
            if link.timestamp>toastDeadline {toast=""}
        }catch{fail(error.localizedDescription)}
    }
    func open(_ screen: GameScreen) {audio?.sound("ui");refresh();self.screen=screen}
    func play(_ mode: String) {
        calibrationResumesRun=false
        selectedMode=mode;audio?.startEngine();audio?.volumes(save["settings"])
        if tracker.usingTouch || tracker.ready && save["calibrated"].bool {launch()}
        else {tracker.previewEnabled=true;screen = .calibrate;Task { isBusy=true;_ = await tracker.start();isBusy=false }}
    }
    func calibration() {
        guard !isBusy else{return}
        countdownTask?.cancel()
        countdownTask=Task {isBusy=true;countdown="HOLD STILL"
            let result=await tracker.calibrate()
            guard !Task.isCancelled else{isBusy=false;return}
            if result {perform("calibrate");refresh();countdown="✓";try? await Task.sleep(for:.milliseconds(350));guard !Task.isCancelled else{return};finishCalibration()}
            else {countdown=""};isBusy=false
        }
    }
    func useTouch() {countdownTask?.cancel();isBusy=false;tracker.enableTouch();finishCalibration()}
    private func finishCalibration() {
        if calibrationResumesRun {calibrationResumesRun=false;tracker.previewEnabled=false;resume()}
        else {launch()}
    }
    private func launch() {
        guard !Task.isCancelled else{return}
        perform("submit",[tag])
        perform("start",[selectedMode,selectedMode == "duel" ? duel["seed"].number as Any:NSNull(),selectedMode == "duel" ? duel["score"].number:0])
        tracker.previewEnabled=false;screen = .playing;audio?.musicFor(world:world,running:true);audio?.volumes(save["settings"]);UIApplication.shared.isIdleTimerDisabled=true
    }
    func pause() {perform("pause",[true]);screen = .paused;audio?.suspend();UIApplication.shared.isIdleTimerDisabled=false}
    func resume() {
        if !tracker.usingTouch && !tracker.ready {recalibrate();return}
        perform("pause",[false]);screen = .playing;audio?.resume();UIApplication.shared.isIdleTimerDisabled=true
    }
    func quit() {
        countdownTask?.cancel();isBusy=false;countdown="";calibrationResumesRun=false
        perform("quit",[tag]);refresh();screen = .menu
        audio?.resume();audio?.musicFor(world:world,running:false);tracker.stop();UIApplication.shared.isIdleTimerDisabled=false
    }
    func recalibrate() {
        calibrationResumesRun = screen == .playing || screen == .paused
        if calibrationResumesRun {perform("pause",[true])}
        countdown="";calibrationStable=0;tracker.previewEnabled=true;screen = .calibrate
        Task{isBusy=true;_ = await tracker.start();isBusy=false}
    }
    func buy(_ id:String) {
        do {if try kernel?.call("buy",[id]).toBool() == true, catalog["UPGRADES"][id].isNull,
            !catalog["STORE_EXTRAS"].array.contains(where:{$0["id"].string==id}) {equip(id)}}
        catch {fail(error.localizedDescription)}
        refresh()
    }
    func equip(_ id:String) {perform("equip",[id]);refresh();audio?.musicFor(world:world,running:false)}
    func space() {perform("space");refresh();audio?.musicFor(world:world,running:false)}
    func setting(_ name:String,_ value:Any) {perform("setting",[name,value]);refresh();if name=="reminders",let on=value as? Bool {reminders(on)}}
    private func reminders(_ on:Bool) {
        let center=UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers:["slouch-posture"])
        guard on else{return}
        Task {
            do {
                guard try await center.requestAuthorization(options:[.alert,.sound]) else {setting("reminders",false);return}
                let content=UNMutableNotificationContent();content.title="SLOUCH";content.body="Neck check. Fly a run?";content.sound = .default
                try await center.add(UNNotificationRequest(identifier:"slouch-posture",content:content,trigger:UNTimeIntervalNotificationTrigger(timeInterval:14400,repeats:false)))
            }catch{fail(error.localizedDescription)}
        }
    }
    func showReport(_ value:JSONValue) {returningFromReport=screen;report=value;let trend=try? kernel?.call("trend");weeklyTrend=trend?.isNull == false ? trend?.toDouble():nil;screen = .report}
    func resetProgress() {perform("reset");tracker.stop();refresh();screen = .menu}
    func closeReport() {screen=returningFromReport}
    func background() {if screen == .playing {pause()};countdownTask?.cancel();isBusy=false;tracker.stop();audio?.suspend();displayLink?.isPaused=true}
    func foreground() {displayLink?.isPaused=false;if screen == .calibrate {Task{isBusy=true;_ = await tracker.start();isBusy=false}};if screen != .paused {audio?.resume()}}
    func acceptURL(_ url:URL) {
        guard let parts=URLComponents(url:url,resolvingAgainstBaseURL:false),let seed=parts.queryItems?.first(where:{$0.name=="duel"})?.value.flatMap(Double.init) else{return}
        let score=parts.queryItems?.first(where:{$0.name=="s"})?.value.flatMap(Double.init) ?? 0
        guard seed.isFinite,seed>=0,seed<=Double(UInt32.max),score.isFinite else{return}
        let name=parts.queryItems?.first(where:{$0.name=="by"})?.value ?? "RIVAL"
        if screen == .playing {pause()}
        duel = .object(["seed":.number(seed),"score":.number(max(0,score)),"tag":.string(String(name.uppercased().prefix(8)))])
        screen = .duel
    }
    func shareDuel() -> URL {
        perform("submit",[tag])
        return URL(string:(try? kernel?.call("duelLink").toString()) ?? "slouch://challenge")!
    }
    private func fail(_ message:String) {guard error == nil else{return};error=message;displayLink?.isPaused=true;audio?.suspend()}
}
@MainActor private final class DisplayLinkProxy:NSObject {
    weak var owner:SlouchModel?
    @objc func tick(_ link:CADisplayLink){owner?.tick(link)}
}
