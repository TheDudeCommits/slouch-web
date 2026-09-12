@preconcurrency import AVFoundation

@MainActor final class GameAudio {
    private let engine = AVAudioEngine()
    private let outputFormat = AVAudioFormat(standardFormatWithSampleRate:48000,channels:2)!
    private let music = AVAudioPlayerNode()
    private let filter = AVAudioUnitEQ(numberOfBands: 1)
    private let ambience = AVAudioPlayerNode()
    private var voices: [(AVAudioPlayerNode,AVAudioUnitVarispeed)] = []
    private var effects: [String: AVAudioPCMBuffer] = [:]
    private var current: String?
    private var stashed: String?
    private var previous: [String: String] = [:]
    private var index = 0
    private var world = "space"
    private var musicVolume: Float = 0.3, effectVolume: Float = 0.16
    private var started = false
    private let root: URL
    var failure: String?
    init(root: URL) { self.root = root }
    func startEngine() {
        guard !started else { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            engine.attach(music); engine.attach(filter); engine.attach(ambience)
            filter.bands[0].filterType = .lowPass; filter.bands[0].frequency = 16000; filter.bands[0].bypass = false
            engine.connect(music, to: filter, format: outputFormat); engine.connect(filter, to: engine.mainMixerNode, format: outputFormat)
            engine.connect(ambience, to: engine.mainMixerNode, format: outputFormat)
            for _ in 0..<12 {
                let node = AVAudioPlayerNode(), pitch = AVAudioUnitVarispeed()
                engine.attach(node); engine.attach(pitch); engine.connect(node, to: pitch, format: outputFormat); engine.connect(pitch, to: engine.mainMixerNode, format: outputFormat); voices.append((node,pitch))
            }
            try engine.start(); started = true
        } catch { failure = error.localizedDescription }
    }
    private func buffer(_ folder: String, _ name: String) throws -> AVAudioPCMBuffer {
        let file = try AVAudioFile(forReading: root.appendingPathComponent("\(folder)/\(name).m4a"))
        guard let b = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)) else { throw CocoaError(.fileReadCorruptFile) }
        try file.read(into:b)
        if b.format == outputFormat {return b}
        guard let converter=AVAudioConverter(from:b.format,to:outputFormat),
              let converted=AVAudioPCMBuffer(pcmFormat:outputFormat,frameCapacity:AVAudioFrameCount(ceil(Double(b.frameLength)*48000/b.format.sampleRate))+64) else {throw CocoaError(.fileReadCorruptFile)}
        var supplied=false
        var error:NSError?
        let status=converter.convert(to:converted,error:&error){_,state in
            if supplied {state.pointee = .endOfStream;return nil}
            supplied=true;state.pointee = .haveData;return b
        }
        if status == .error {throw error ?? NSError(domain:"SlouchAudio",code:1)}
        return converted
    }
    func volumes(_ settings: JSONValue) {
        musicVolume = Float(settings["music"].number / 100) * 0.5
        effectVolume = Float(settings["sfx"].number / 100) * 0.2
        music.volume = musicVolume; ambience.volume = settings["music"].int == 0 ? 0 : 0.22
    }
    func musicFor(world: String, running: Bool) {
        startEngine(); self.world = world; stashed = nil
        let pools: [String: [[String]]] = [
            "space": [["eighties","spaceranger","chillwave"],["retrowave","synthwave","retro80s","neondrive","arcadenights","midnight"]],
            "ocean": [["oc_deep","oc_coastal"],["oc_chill","oc_vibes","oc_coconut","oc_coastal"]],
            "jungle": [["jg_uku1","jg_advent"],["jg_uku1","jg_uku2","jg_marimba","jg_advent"]]]
        pick(pools[world]![running ? 1 : 0], key: world + (running ? ":run" : ":menu"))
        ambience.stop()
        if world != "space", let b = try? buffer("sfx", "amb_" + world) { ambience.scheduleBuffer(b, at: nil, options: .loops); ambience.play(); ambience.volume = musicVolume == 0 ? 0 : 0.22 }
    }
    private func pick(_ names: [String], key: String) {
        let name = names.filter { $0 != previous[key] }.randomElement() ?? names[0]
        previous[key] = name; playTrack(name)
    }
    private func playTrack(_ name: String) {
        guard started, current != name else { return }
        do { let b = try buffer("music",name); music.stop(); music.scheduleBuffer(b,at:nil,options:.loops); music.volume = musicVolume; music.play(); current = name }
        catch { failure = "Music \(name): \(error.localizedDescription)" }
    }
    func event(_ event: String) {
        guard world == "space" else { return }
        if event == "boss" || event == "wormhole" { if stashed == nil { stashed = current }; pick(["loop1","loop2","loop3","loop4","loop5"],key:"loops") }
        else if event == "restore", let name = stashed { playTrack(name); stashed = nil }
    }
    func intensity(_ value: Double) { filter.bands[0].frequency = Float(900 + pow(max(0,min(1,value)),1.4)*15000) }
    func sound(_ name: String, gain: Float = 0.7, rate: Float = 1) {
        guard started else { return }
        let overrides = world == "ocean" ? ["near":"o_pop","smash":"o_splash","crash":"o_splash","laser":"o_pop"] : world == "jungle" ? ["smash":"j_thump","crash":"j_thump"] : [:]
        let file = overrides[name] ?? name
        do {
            if effects[file] == nil { effects[file] = try buffer("sfx",file) }
            let (voice,pitch) = voices[index % voices.count]; index += 1
            voice.stop(); pitch.rate = rate; voice.volume = effectVolume * gain
            voice.scheduleBuffer(effects[file]!); voice.play()
        } catch { failure = "Sound \(file): \(error.localizedDescription)" }
    }
    func suspend() { music.pause(); ambience.pause(); voices.forEach { $0.0.stop() }; engine.pause() }
    func resume() { guard started else { return }; do { try engine.start(); music.play(); if world != "space" { ambience.play() } } catch { failure = error.localizedDescription } }
}
