import Foundation
import JavaScriptCore

/// No DOM, web view or network code. Original simulation runs on the main thread;
/// RealityKit consumes snapshots and never writes gameplay state.
final class GameKernel {
    let context: JSContext
    private var bridge: JSValue!
    private(set) var catalog: JSONValue = .null
    private(set) var error: String?
    private let resources: URL
    private let saveURL: URL
    init(resources: URL, saveURL: URL) throws {
        self.resources = resources; self.saveURL = saveURL
        guard let context = JSContext() else { throw KernelError.message("Cannot initialize gameplay engine") }
        self.context = context
        context.exceptionHandler = { [weak self] _, value in self?.error = value?.toString() ?? "Unknown gameplay error" }
        let read: @convention(block) () -> String? = { try? String(contentsOf: saveURL, encoding: .utf8) }
        let write: @convention(block) (String) -> Void = { [weak self] value in
            do {
                try FileManager.default.createDirectory(at: saveURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                try value.write(to: saveURL, atomically: true, encoding: .utf8)
            } catch { self?.error = "Could not save progress: \(error.localizedDescription)" }
        }
        context.setObject(read, forKeyedSubscript: "nativeReadSave" as NSString)
        context.setObject(write, forKeyedSubscript: "nativeWriteSave" as NSString)
        for file in ["runtime.js", "engine.js"] {
            let url = resources.appendingPathComponent(file)
            context.evaluateScript(try String(contentsOf: url, encoding: .utf8), withSourceURL: url)
            if let error { throw KernelError.message(error) }
        }
        bridge = context.evaluateScript("bridge")
        let assets = try String(contentsOf: resources.appendingPathComponent("Models/manifest.json"), encoding: .utf8)
        catalog = try json("initialize", [assets])
    }
    @discardableResult func call(_ method: String, _ arguments: [Any] = []) throws -> JSValue {
        error = nil
        guard let result = bridge.invokeMethod(method, withArguments: arguments) else { throw KernelError.message("Missing gameplay method: \(method)") }
        if let error { throw KernelError.message(error) }
        return result
    }
    func json(_ method: String, _ arguments: [Any] = []) throws -> JSONValue {
        try JSONValue.parse(call(method, arguments).toString() ?? "null")
    }
    func tick(milliseconds: Double, pose: JSONValue) throws -> FrameSnapshot {
        let string = try call("tick", [milliseconds, pose.json]).toString() ?? "{}"
        return try JSONDecoder().decode(FrameSnapshot.self, from: Data(string.utf8))
    }
    enum KernelError: LocalizedError { case message(String); var errorDescription: String? { if case .message(let s) = self { return s }; return nil } }
}

struct FrameSnapshot: Decodable {
    var revision: Int
    var world: String
    var grounded: Bool
    var floorY: Float
    var running: Bool
    var paused: Bool
    var over: Bool
    var time: Double
    var speed: Float
    var sector: String
    var hyper: Float
    var heroMotion: String
    var heroSpeed: Float
    var camera: CameraSnapshot
    var nodes: [NodeSnapshot]
    var ui: JSONValue
    var events: [GameEvent]
}
struct CameraSnapshot: Decodable { var x, y, z, fov, lookX, lookY, roll: Float }
struct NodeSnapshot: Decodable {
    var id: Int
    var kind: String
    var p, r, s: [Float]
    var asset: String?
    var len, radius, shipLength, halfH: Float?
    var yaw: Float
    var clip, direction, gapAxis, type: String?
    var gapCenter, gapHalf, spin: Float?
    var bob, bounce: Bool
    var clipMap: [String: String]
    var animSpeed: Float
}
struct GameEvent: Decodable { var kind: String; var data: JSONValue }
struct AssetDefinition: Decodable {
    var source, sha256, file: String
    var size, center: [Float]
    var radius: Float
    var clips: [String: String]
}
