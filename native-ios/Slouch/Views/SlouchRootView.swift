import SwiftUI

struct SlouchRootView:View {
    @Bindable var model:SlouchModel
    @State private var storeTab="WORLDS"
    @State private var boardTab="techneck"
    @State private var importedDuel=""
    @State private var sharing:SlouchShare?
    @State private var confirmingReset=false
    private var save:JSONValue {model.save}
    var body:some View {
        ZStack {
            model.backgroundColor.ignoresSafeArea()
            if let renderer=model.renderer {NativeWorldView(renderer:renderer).ignoresSafeArea().accessibilityHidden(true)}
            if model.screen == .playing {
                GeometryReader{g in Color.clear.contentShape(Rectangle()).gesture(DragGesture(minimumDistance:0).onChanged{v in
                    guard model.tracker.usingTouch else{return}
                    model.tracker.touchX=Double(v.location.x/g.size.width)*2-1
                    model.tracker.touchY=1-Double(v.location.y/g.size.height)*2
                }.onEnded{_ in model.tracker.touchX=0;model.tracker.touchY=0})}.ignoresSafeArea().accessibilityElement().accessibilityLabel("Game steering area").accessibilityIdentifier("game-steering")
                gameHUD
            }else {
                LinearGradient(colors:[model.backgroundColor.opacity(0.55),model.backgroundColor.opacity(0.86),model.backgroundColor],startPoint:.top,endPoint:.bottom).ignoresSafeArea()
                screenContent
            }
            if !model.toast.isEmpty,model.screen == .playing {
                VStack{Spacer().frame(height:150);Text(model.toast).font(.custom("ChakraPetch-Bold",size:14)).tracking(2).foregroundStyle(model.accent).multilineTextAlignment(.center).padding();Spacer()}.allowsHitTesting(false)
            }
            if let error=model.error {
                VStack(spacing:20){SlouchLabel(text:"SLOUCH COULD NOT CONTINUE",color:model.hot);Text(error).textSelection(.enabled).multilineTextAlignment(.center);Text("Your saved progress has been kept.").foregroundStyle(model.muted)}
                    .padding(28).frame(maxWidth:500).background(model.backgroundColor,in:RoundedRectangle(cornerRadius:20))
            }
        }.foregroundStyle(slouchInk).font(.custom("ChakraPetch-Regular",size:14)).preferredColorScheme(.dark).statusBarHidden().sheet(item:$sharing){ShareActivity(payload:$0)}
            .confirmationDialog("Wipe all scores, streaks, purchases and settings?",isPresented:$confirmingReset,titleVisibility:.visible){Button("RESET ALL PROGRESS",role:.destructive){model.resetProgress()}}
    }
    @ViewBuilder private var screenContent:some View {
        switch model.screen {
        case .loading:
            VStack(spacing:24){logo;ProgressView().tint(model.accent);Text("loading original worlds…").foregroundStyle(model.muted)}
        case .menu:menu
        case .calibrate:calibration
        case .paused:
            panel("PAUSED"){
                SlouchButton(title:"RESUME",primary:true,accent:model.accent){model.resume()}
                SlouchButton(title:"RECALIBRATE",accent:model.accent){model.recalibrate()}
                SlouchButton(title:"QUIT TO MENU"){model.quit()}
            }
        case .gameover:gameover
        case .store:store
        case .settings:settings
        case .boards:boards
        case .honors:honors
        case .lore:lore
        case .history:history
        case .report:reportView
        case .goals:
            panel("DAILY GOALS"){
                GoalRings(goals:save["goals"],accent:model.accent).scaleEffect(3).frame(height:150)
                statRow("MOVE", "\(save["goals"]["moveSec"].int) / 90 SEC")
                statRow("CHIN TUCKS","\(save["goals"]["tucks"].int) / 10")
                statRow("STRETCHES","\(save["goals"]["stretches"].int) / 6")
                Text("Close all three rings · +200 stardust").foregroundStyle(model.muted)
                back
            }
        case .duel:
            panel("CHALLENGE FROM \(model.duel["tag"].string)"){
                bigNumber(model.duel["score"].int)
                SlouchButton(title:"ACCEPT",primary:true,accent:model.accent){model.play("duel")}
                SlouchButton(title:"LATER"){model.open(.menu)}
            }
        case .playing:EmptyView()
        }
    }
    private var logo:some View {
            Text("SLOUCH").font(.custom(model.displayFont,size:60).weight(model.world == "space" ? .regular:.semibold)).tracking(2.4)
            .minimumScaleFactor(0.5).lineLimit(1).shadow(color:model.accent.opacity(0.5),radius:17).padding(.horizontal,20)
    }
    private var menu:some View {
        GeometryReader{g in
            VStack(spacing:0){
                HStack{
                    Label("\(save["streak"]["count"].int)",systemImage:"flame").foregroundStyle(model.hot)
                    Spacer()
                    Button{model.open(.goals)}label:{GoalRings(goals:save["goals"],accent:model.accent)}.accessibilityLabel("Daily goals")
                    Spacer()
                    Label("\(save["points"].int)",systemImage:"sparkle").foregroundStyle(model.accent)
                }.padding(.horizontal,26).padding(.top,12)
                Spacer(minLength:10)
                ScrollView(showsIndicators:false){
                    VStack(spacing:6){
                        logo
                        Text("⌃  \(model.menu["rank"]["rank"].string) · LV \(model.menu["rank"]["level"].int)")
                            .font(.custom("ChakraPetch-SemiBold",size:12)).tracking(1).foregroundStyle(model.muted)
                        if max(save["best"]["techneck"].int,save["best"]["casual"].int)>0 {
                            Text(max(save["best"]["techneck"].int,save["best"]["casual"].int).formatted()).font(.custom(model.displayFont,size:30))
                        }
                        if !model.menu["event"].isNull {Text(model.menu["event"]["name"].string+" — "+model.menu["event"]["desc"].string).font(.custom("ChakraPetch-Regular",size:12)).foregroundStyle(model.accent).multilineTextAlignment(.center).padding(.vertical,6)}
                        VStack(spacing:2){
                            SlouchButton(title:"▷  TECH NECK",primary:true,accent:model.accent){model.play("techneck")}.accessibilityIdentifier("play-techneck")
                            SlouchButton(title:"CASUAL",accent:model.accent){model.play("casual")}
                            Button{model.play("daily")}label:{
                                VStack(spacing:5){Text(model.menu["mutator"]["name"].string).tracking(2)
                                    Text(save["daily"]["best"].int>0 ? "best \(save["daily"]["best"].int.formatted())":model.menu["mutator"]["desc"].string)
                                        .font(.custom("ChakraPetch-Regular",size:12)).foregroundStyle(model.muted)}
                                .padding(13).frame(maxWidth:300)
                            }.buttonStyle(.plain)
                        }.padding(.top,12)
                        missionList.padding(.top,12)
                    }.frame(maxWidth:420).frame(maxWidth:.infinity)
                }.scrollClipDisabled().frame(maxHeight:g.size.height<580 ? g.size.height-130:430)
                Spacer(minLength:10)
                HStack(spacing:0){
                    MenuIcon(title:"STORE",symbol:"sparkle"){model.open(.store)}
                    MenuIcon(title:"RANKS",symbol:"chart.bar"){model.open(.boards)}
                    MenuIcon(title:"HONORS",symbol:"trophy"){model.open(.honors)}
                    MenuIcon(title:"SYSTEM",symbol:"gearshape"){model.open(.settings)}
                }.padding(.bottom,10)
            }
        }
    }
    private var missionList:some View {
        VStack(spacing:0){
            ForEach(save["missions"]["ids"].array.map(\.string),id:\.self){id in
                let def=model.catalog["MISSION_POOL"].array.first{$0["id"].string==id} ?? .null
                HStack(spacing:10){
                    Circle().fill(save["missions"]["done"][id].bool ? model.accent:model.muted.opacity(0.5)).frame(width:4,height:4)
                    Text(def["desc"].string).font(.custom("ChakraPetch-Regular",size:12));Spacer()
                    if save["missions"]["done"][id].bool {Image(systemName:"checkmark").foregroundStyle(model.accent)}
                }.padding(.vertical,8).overlay(alignment:.bottom){model.muted.opacity(0.2).frame(height:0.5)}
            }
        }.frame(maxWidth:320).foregroundStyle(model.muted)
    }
    private var calibration:some View {
        panel("CALIBRATE"){
            Text("Sit tall. Shoulders relaxed.\nLook straight at the camera.").multilineTextAlignment(.center).foregroundStyle(model.muted)
            ZStack{
                RoundedRectangle(cornerRadius:16).fill(.black)
                if let image=model.tracker.preview {Image(uiImage:image).resizable().scaledToFill()}
                Ellipse().stroke(model.tracker.hasFace ? model.accent:model.muted,style:StrokeStyle(lineWidth:1,dash:[6,5])).padding(.horizontal,35).padding(.vertical,28)
            }.frame(width:230,height:270).clipShape(RoundedRectangle(cornerRadius:16))
            Text(model.countdown).font(.custom(model.displayFont,size:28)).frame(minHeight:35)
            Text(model.tracker.message).multilineTextAlignment(.center).foregroundStyle(model.muted)
            if model.tracker.ready {Text("sit tall · hold still").foregroundStyle(model.accent)}
            if model.isBusy {ProgressView().tint(model.accent)}
            SlouchButton(title:"USE TOUCH CONTROLS"){model.useTouch()}
            SlouchButton(title:"BACK"){model.quit()}
        }
    }
    private var gameHUD:some View {
        VStack(spacing:0){
            HStack(alignment:.top){
                VStack(alignment:.leading,spacing:5){
                    HStack(alignment:.firstTextBaseline,spacing:8){
                        Text(model.hud["score"].int.formatted()).font(.custom(model.displayFont,size:40)).shadow(color:model.accent.opacity(0.4),radius:8).accessibilityIdentifier("game-score")
                        Text(String(format:"×%.1f",model.hud["mult"].number)).font(.custom("ChakraPetch-Bold",size:17)).foregroundStyle(model.accent)
                    }
                    ThinBar(progress:model.hud["energy"].number,color:model.accent).frame(width:170)
                    ThinBar(progress:model.hud["flow"].number,color:slouchInk,height:2).frame(width:170)
                    if model.hud["shield"].bool {Text(model.text["hyper"].string).font(.custom("ChakraPetch-Bold",size:11)).tracking(3).foregroundStyle(model.accent)}
                }
                Spacer()
                VStack(alignment:.trailing,spacing:14){
                    Button{model.pause()}label:{GameIcon(name:"pause").frame(width:44,height:44)}.accessibilityLabel("Pause")
                    if !model.hud["pace"].isNull {Text("\(model.hud["pace"].int>=0 ? "+":"")\(model.hud["pace"].int) vs best").font(.custom("ChakraPetch-Regular",size:12))}
                    ForEach(["magnet","focus","doubler"],id:\.self){p in if model.hud["powerups"][p].number>0 {Text("\(p.uppercased()) \(Int(ceil(model.hud["powerups"][p].number)))s").font(.custom("ChakraPetch-Bold",size:11)).foregroundStyle(model.accent)}}
                }
            }.padding(.horizontal,20).padding(.top,12)
            if !model.hud["boss"].isNull {SlouchLabel(text:model.hud["boss"].string,color:model.hot).padding(.top,15)}
            if !model.hud["gate"].isNull {
                VStack(spacing:10){SlouchLabel(text:model.hud["gate"].string,color:Color.yellow);ThinBar(progress:model.hud["gateProgress"].number,color:.yellow).frame(width:180)}.padding(.top,28)
            }
            Spacer()
            if !model.hud["boons"].array.isEmpty {
                SlouchLabel(text:"TILT TO CHOOSE",color:model.accent)
                HStack(spacing:22){
                    ForEach(Array(model.hud["boons"].array.enumerated()),id:\.offset){i,b in
                        Button{model.perform("choose",[i])}label:{
                            VStack(spacing:12){Text(b["name"].string).font(.custom(model.displayFont,size:16));Text(b["desc"].string).font(.custom("ChakraPetch-Regular",size:13));ThinBar(progress:model.hud["lean"].int == (i==0 ? -1:1) ? model.hud["leanProgress"].number:0,color:model.accent)}
                                .frame(maxWidth:180).padding(14).background(model.backgroundColor.opacity(0.8),in:RoundedRectangle(cornerRadius:12))
                                .overlay(RoundedRectangle(cornerRadius:12).stroke(model.accent.opacity(0.4),lineWidth:1))
                        }.buttonStyle(.plain)
                    }
                }.padding(20).padding(.bottom,65)
            }
            if model.hud["faceLost"].bool {Text("FACE LOST · LOOK AT THE CAMERA").foregroundStyle(model.accent).tracking(1).padding(20)}
            if model.hud["slouch"].bool {Text("SIT TALL · CHIN BACK").foregroundStyle(model.hot).font(.custom("ChakraPetch-Bold",size:16)).tracking(2).padding(.bottom,70)}
            Spacer().frame(height:20)
        }
    }
    private var gameover:some View {
        let run=model.menu["lastRun"]
        return panel(["daily":"DAILY RUN COMPLETE","duel":"DUEL OVER","weekly":"WEEKLY RUN LOGGED"][run["mode"].string] ?? model.text["death"].string){
            bigNumber(run["score"].int)
            if run["isBest"].bool {SlouchLabel(text:"NEW BEST",color:model.accent)}
            HStack(spacing:30){Text("✧ +\(run["earned"].int)");Text("+\(run["xpGain"].int) XP")}.foregroundStyle(model.accent)
            if run["ranked"].bool {Text("LEVEL \(run["rank"]["level"].int) · \(run["rank"]["rank"].string)").foregroundStyle(model.accent)}
            if !run["won"].isNull {Text(run["won"].bool ? "DUEL WON":"DUEL LOST — REMATCH?").foregroundStyle(model.accent)}
            if !run["extra"]["pace"].isNull,!run["isBest"].bool {
                let pace=run["score"].int-Int(run["extra"]["pace"].number.rounded())
                Text("\(abs(pace).formatted()) \(pace>=0 ? "AHEAD OF YOUR GHOST AT THE END":"BEHIND YOUR GHOST")").foregroundStyle(model.muted)
            }
            ForEach(run["fresh"].array,id:\.self){a in Text("♜ "+a["name"].string).foregroundStyle(model.accent)}
            if ["techneck","casual"].contains(run["mode"].string) {
                TextField("PILOT TAG",text:$model.tag).textInputAutocapitalization(.characters).autocorrectionDisabled().multilineTextAlignment(.center)
                    .font(.custom("ChakraPetch-Bold",size:18)).padding(8).frame(width:180).overlay(alignment:.bottom){model.accent.frame(height:1)}
                    .onChange(of:model.tag){_,s in model.tag=String(s.uppercased().prefix(8))}
            }
            missionList
            SlouchButton(title:model.text["retry"].string,primary:true,accent:model.accent){model.play(model.selectedMode)}
            HStack {
                Button{model.showReport(run["report"])}label:{Label("REPORT",systemImage:"chart.bar")}
                Button{share(run["report"],duel:true)}label:{Label("DUEL",systemImage:"square.and.arrow.up")}
            }.font(.custom("ChakraPetch-SemiBold",size:12)).padding(10)
            SlouchButton(title:"MENU"){model.quit()}
        }
    }
    private var store:some View {
        page("STORE"){
            HStack{Label("\(save["points"].int)",systemImage:"sparkle");Spacer();Button("DEEP SPACE"){model.space()}}.foregroundStyle(model.accent)
            ScrollView(.horizontal,showsIndicators:false){
                HStack(spacing:18){ForEach(["WORLDS","HEROES","HULLS","THEMES","TRAILS","BOOMS","UPGRADES","EXTRAS"],id:\.self){t in
                    Button(t){storeTab=t}.foregroundStyle(storeTab==t ? model.accent:model.muted).font(.custom("ChakraPetch-Bold",size:12))
                }}.padding(.vertical,14)
            }
            ForEach(storeItems,id:\.0){id,item in
                let owned=save["owned"].array.contains(.string(id))
                let equipped=isEquipped(id)
                VStack(alignment:.leading,spacing:10){
                    HStack{Text(item["name"].string).font(.custom(model.displayFont,size:17));Spacer();if equipped {Image(systemName:"checkmark").foregroundStyle(model.accent)}}
                    Text(item["desc"].string).foregroundStyle(model.muted)
                    HStack{
                        if storeTab=="UPGRADES" {Text("LEVEL \(save["upgrades"][id].int) / 3").foregroundStyle(model.accent)}
                        Spacer()
                        if equipped {Text("EQUIPPED").foregroundStyle(model.accent)}
                        else if owned {Button("EQUIP"){model.equip(id)}}
                        else if storeTab=="UPGRADES" && save["upgrades"][id].int>=3 {Text("MAX")}
                        else {
                            let price=storeTab=="UPGRADES" ? item["prices"][save["upgrades"][id].int].int:item["price"].int
                            Button("✧ \(price)"){model.buy(id)}.disabled(save["points"].int<price || id == "revive" && save["revives"].int>=3).accessibilityIdentifier("buy-"+id)
                        }
                    }.font(.custom("ChakraPetch-Bold",size:13))
                }.padding(.vertical,18).overlay(alignment:.bottom){model.muted.opacity(0.3).frame(height:0.5)}
            }
            Text("All purchases use stardust earned in-game.").font(.custom("ChakraPetch-Regular",size:12)).foregroundStyle(model.muted).padding(.top,16)
        }
    }
    private var storeItems:[(String,JSONValue)] {
        let keys:[String]
        switch storeTab {case "WORLDS":keys=["WORLD_PACKS"];case "HEROES":keys=["OCEAN_HEROES","JUNGLE_HEROES"];case "HULLS":keys=["SKINS"];case "THEMES":keys=["THEMES"];case "TRAILS":keys=["TRAILS"];case "BOOMS":keys=["BOOMS"];case "UPGRADES":keys=["UPGRADES"];default: return model.catalog["STORE_EXTRAS"].array.map{($0["id"].string,$0)}}
        return keys.filter { $0 != "OCEAN_HEROES" && $0 != "JUNGLE_HEROES" || save["owned"].array.contains(.string($0 == "OCEAN_HEROES" ? "world_ocean":"world_jungle")) }
            .flatMap{model.catalog[$0].object.map{($0.key,$0.value)}}.sorted{($0.1["price"].int,$0.0)<($1.1["price"].int,$1.0)}
    }
    private func isEquipped(_ id:String)->Bool {
        if id.hasPrefix("world_"){return id=="world_"+model.world}
        if id.hasPrefix("theme_"){return model.world=="space" && save["equippedTheme"].string==id}
        return [save["oceanHero"].string,save["jungleHero"].string,save["equipped"]["skin"].string,save["equipped"]["trail"].string,save["equipped"]["boom"].string].contains(id)
    }
    private var settings:some View {
        page("SYSTEM"){
            settingSlider("MUSIC","music",0...100)
            settingSlider("SFX","sfx",0...100)
            settingSlider("SENSITIVITY","sensitivity",50...200)
            Toggle("MIRROR CONTROLS",isOn:settingBool("mirror")).tint(model.accent).padding(.vertical,8)
            Toggle("GHOST PACE",isOn:settingBool("ghost")).tint(model.accent).padding(.vertical,8)
            Toggle("BREAK REMINDERS",isOn:settingBool("reminders")).tint(model.accent).padding(.vertical,8)
            SlouchButton(title:"RECALIBRATE",accent:model.accent){model.recalibrate()}
            SlouchButton(title:"FLIGHT HISTORY"){model.open(.history)}
            SlouchButton(title:"LORE CODEX"){model.open(.lore)}
            TextField("Paste a Slouch duel link",text:$importedDuel).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder)
            SlouchButton(title:"OPEN DUEL"){if let u=URL(string:importedDuel){model.acceptURL(u)}}
            SlouchButton(title:"RESET ALL PROGRESS",accent:model.hot){confirmingReset=true}
            Text("Camera tracking and progress stay on this device. Touch runs do not count toward posture goals.").font(.custom("ChakraPetch-Regular",size:12)).foregroundStyle(model.muted).padding(.top,18)
        }
    }
    private func settingSlider(_ title:String,_ key:String,_ range:ClosedRange<Double>)->some View {
        VStack{statRow(title,"\(save["settings"][key].int)");Slider(value:Binding(get:{save["settings"][key].number},set:{model.setting(key,$0)}),in:range,step:1).tint(model.accent)}.padding(.vertical,10)
    }
    private func settingBool(_ key:String)->Binding<Bool> {Binding(get:{save["settings"][key].bool},set:{model.setting(key,$0)})}
    private var boards:some View {
        page("RANKS"){
            Picker("Scoreboard",selection:$boardTab){Text("TECH NECK").tag("techneck");Text("CASUAL").tag("casual");Text("DAILY").tag("daily");Text("WEEKLY").tag("weekly")}.pickerStyle(.segmented)
            let scores=["daily","weekly"].contains(boardTab) ? save[boardTab]["list"].array:save["boards"][boardTab].array
            if scores.isEmpty {Text("No flights logged yet.").foregroundStyle(model.muted).padding(.vertical,30)}
            ForEach(Array(scores.enumerated()),id:\.offset){index,row in statRow("\(index+1)  \(row["tag"].string)",row["score"].int.formatted()).padding(.vertical,12)}
            if boardTab=="weekly" {SlouchButton(title:"ENTER WEEKLY RUN",primary:true,accent:model.accent){model.play("weekly")}}
            Text("Local device scores").font(.custom("ChakraPetch-Regular",size:12)).foregroundStyle(model.muted)
        }
    }
    private var honors:some View {
        page("HONORS"){
            ForEach(model.catalog["ACHIEVEMENTS"].array,id:\.self){a in
                HStack(alignment:.top,spacing:14){
                    Image(systemName:save["achievements"][a["id"].string].isNull ? "lock":"trophy").foregroundStyle(model.accent)
                    VStack(alignment:.leading,spacing:6){Text(a["name"].string).font(.custom("ChakraPetch-Bold",size:16));Text(a["desc"].string).foregroundStyle(model.muted)}
                }.opacity(save["achievements"][a["id"].string].isNull ? 0.5:1).padding(.vertical,12)
            }
        }
    }
    private var lore:some View {
        page("LORE CODEX"){
            ForEach(Array(model.catalog["LORE"].array.enumerated()),id:\.offset){i,l in
                VStack(alignment:.leading,spacing:10){Text(i<save["lore"].int ? l["t"].string:"SIGNAL \(String(format:"%03d",i+1)) — LOCKED").font(.custom("ChakraPetch-Bold",size:15)).foregroundStyle(model.accent);if i<save["lore"].int {Text(l["p"].string).lineSpacing(4)}}
                    .padding(.vertical,14)
            }
        }
    }
    private var history:some View {
        page("FLIGHT HISTORY"){
            let cameraRuns=save["history"].array.filter{!$0["touch"].bool}
            if cameraRuns.count>=6 {
                ForEach([("ROTATION",["yawL","yawR"]),("EXTENSION",["pitchU"]),("SIDE BEND",["rollL","rollR"])],id:\.0){label,keys in
                    let newest=Array(cameraRuns.prefix(5)),oldest=Array(cameraRuns.suffix(5))
                    let delta=keys.reduce(0.0){sum,key in sum+(newest.reduce(0){$0+$1["rom"][key].number}/Double(newest.count)-oldest.reduce(0){$0+$1["rom"][key].number}/Double(oldest.count))}/Double(keys.count)
                    statRow(label,String(format:"%+.1f° since your first flights",delta)).padding(.vertical,5)
                }
            } else {Text("RANGE-OF-MOTION TREND · needs 6+ camera runs").foregroundStyle(model.muted).padding(.vertical,14)}
            if save["history"].array.isEmpty {Text("Your flight reports will appear here.").foregroundStyle(model.muted).padding(.vertical,30)}
            ForEach(Array(save["history"].array.enumerated()),id:\.offset){_,r in
                Button{model.showReport(r)}label:{
                    VStack(spacing:8){statRow(r["date"].string+" · "+r["mode"].string.uppercased(),r["score"].int.formatted());statRow("STRETCH", "\(r["stretchScore"].int) / 100")}
                        .padding(.vertical,16)
                }.buttonStyle(.plain)
            }
        }
    }
    private var reportView:some View {
        panel("FLIGHT REPORT"){
            ReportCard(report:model.report,tag:model.tag,accent:model.accent,displayFont:model.displayFont)
            Text(model.weeklyTrend.map{String(format:"%+.0f VS LAST WEEK",$0)} ?? "fly more runs to unlock weekly trends").font(.custom("ChakraPetch-Regular",size:12)).foregroundStyle(model.muted)
            HStack(spacing:22){goal("MOVE",save["goals"]["moveSec"].int,90);goal("TUCKS",save["goals"]["tucks"].int,10);goal("STRETCH",save["goals"]["stretches"].int,6)}.padding(.vertical,12)
            Button{share(model.report,duel:false)}label:{Label("SHARE REPORT",systemImage:"square.and.arrow.up")}.padding(12)
            SlouchButton(title:"BACK"){model.closeReport()}
        }
    }
    private func goal(_ name:String,_ value:Int,_ target:Int)->some View {VStack(spacing:6){Text("\(min(value,target))/\(target)").foregroundStyle(model.accent);Text(name).font(.custom("ChakraPetch-Regular",size:11)).foregroundStyle(model.muted)}}
    private func share(_ report:JSONValue,duel:Bool) {
        let text=duel ? "I scored \(report["score"].int.formatted()) in SLOUCH — beat me: \(model.shareDuel().absoluteString)" :
            "I scored \(report["score"].int.formatted()) in SLOUCH · stretch score \(report["stretchScore"].int)/100"
        sharing=SlouchShare(image:ShareCard.render(report:report,tag:model.tag,duel:duel),text:text)
    }
    private func bigNumber(_ value:Int)->some View {Text(value.formatted()).font(.custom(model.displayFont,size:56)).shadow(color:model.accent.opacity(0.4),radius:13).minimumScaleFactor(0.5).lineLimit(1)}
    private func statRow(_ title:String,_ value:String)->some View {HStack{Text(title).foregroundStyle(model.muted);Spacer();Text(value)}}
    private var back:some View {SlouchButton(title:"BACK"){model.open(.menu)}}
    private func panel<Content:View>(_ title:String,@ViewBuilder content:()->Content)->some View {
        ScrollView{VStack(spacing:16){SlouchLabel(text:title,color:model.accent).padding(.bottom,8);content()}.frame(maxWidth:430).padding(26).frame(maxWidth:.infinity)}
            .defaultScrollAnchor(.center)
    }
    private func page<Content:View>(_ title:String,@ViewBuilder content:()->Content)->some View {
        VStack(spacing:18){
            HStack{Button{model.open(.menu)}label:{GameIcon(name:"chevron.left").frame(width:44,height:44)}.accessibilityLabel("Back");Spacer();SlouchLabel(text:title,color:model.accent);Spacer();Color.clear.frame(width:44,height:44)}.padding(.horizontal,10)
            ScrollView{VStack(alignment:.leading,spacing:8){content()}.frame(maxWidth:530).padding(.horizontal,26).padding(.bottom,30).frame(maxWidth:.infinity)}
        }.padding(.top,10)
    }
}

struct ReportCard:View {
    let report:JSONValue,tag:String
    var accent=Color.cyan
    var displayFont="ZenDots-Regular"
    var body:some View {
        VStack(spacing:18){
            Text(report["score"].int.formatted()).font(.custom(displayFont,size:48))
            Text(tag+" · "+report["mode"].string.uppercased()).foregroundStyle(slouchMuted)
            ZStack {
                Circle().stroke(accent.opacity(0.15),lineWidth:12)
                Circle().trim(from:0,to:report["stretchScore"].number/100).stroke(accent,style:StrokeStyle(lineWidth:12,lineCap:.round)).rotationEffect(.degrees(-90))
                VStack{Text("\(report["stretchScore"].int)").font(.custom(displayFont,size:38));Text("STRETCH SCORE").font(.custom("ChakraPetch-Bold",size:10)).foregroundStyle(slouchMuted)}
            }.frame(width:150,height:150).padding(10)
            if report["touch"].bool {Text("TOUCH MODE · \(report["duration"].int)s").foregroundStyle(slouchMuted)}
            else {
                ForEach([("ROTATION L","yawL",40.0),("ROTATION R","yawR",40.0),("CHIN UP","pitchU",30.0),("CHIN DOWN","pitchD",30.0),("SIDE BEND L","rollL",30.0),("SIDE BEND R","rollR",30.0)],id:\.0){label,key,max in
                    metric(label,"\(report["rom"][key].int)°",report["rom"][key].number/max)
                }
                metric("IN NEUTRAL","\(report["neutralPct"].int)%",report["neutralPct"].number/100)
                metric("MOVING","\(report["moveSec"].int)s",report["moveSec"].number/120)
                metric("HYPERDRIVE","\(report["hyperSec"].int)s",report["hyperSec"].number/60)
            }
        }.frame(maxWidth:320)
    }
    private func metric(_ title:String,_ value:String,_ progress:Double)->some View {HStack{Text(title).foregroundStyle(slouchMuted).frame(width:105,alignment:.leading);ThinBar(progress:progress,color:accent,height:3);Text(value).frame(width:45,alignment:.trailing)}.font(.custom("ChakraPetch-Regular",size:12))}
}
