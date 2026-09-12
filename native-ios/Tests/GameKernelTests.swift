import XCTest
#if canImport(SlouchCore)
@testable import SlouchCore
#else
@testable import Slouch
#endif
final class GameKernelTests:XCTestCase {
    private func resources()->URL {
        #if os(macOS)
        return URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Slouch/GameResources")
        #else
        return Bundle.main.resourceURL!.appendingPathComponent("GameResources")
        #endif
    }
    private func host() throws -> GameKernel {
        let path=FileManager.default.temporaryDirectory.appendingPathComponent("slouch-test-"+UUID().uuidString).appendingPathComponent("save.json")
        addTeardownBlock{try? FileManager.default.removeItem(at:path.deletingLastPathComponent())}
        return try GameKernel(resources:resources(),saveURL:path)
    }
    private var touch:JSONValue{.object(["usingTouch":.bool(true),"touchX":.number(0),"touchY":.number(0)])}
    func testOriginalEngineExecutesInAppleJavaScriptCore() throws {
        let host=try host()
        XCTAssertEqual(host.catalog["WORLD_PACKS"]["world_jungle"]["price"].int,3000)
        try host.call("start",["techneck",12345,0])
        var frame=try host.tick(milliseconds:16,pose:touch)
        for i in 2...60{frame=try host.tick(milliseconds:Double(i)*16,pose:touch)}
        XCTAssertGreaterThan(frame.ui["score"].int,0)
        XCTAssertEqual(frame.world,"space")
        XCTAssertEqual(frame.nodes.first{$0.kind=="ship"}?.asset,"ships__crosswing")
    }
    func testNativeSaveRoundTripsAndRejectsUnaffordablePack() throws {
        let host=try host(),before=try host.json("menu")
        XCTAssertFalse(try host.call("buy",["world_jungle"]).toBool())
        let after=try host.json("menu")
        XCTAssertEqual(before["save"]["points"],after["save"]["points"])
        XCTAssertEqual(after["save"]["equippedWorld"].string,"space")
        try host.call("setting",["music",37])
        let saved=try JSONValue.parse(host.call("exportSave").toString())
        XCTAssertEqual(saved["settings"]["music"].int,37)
        XCTAssertTrue(saved["owned"].array.contains(.string("skin_crosswing")))
    }
    func testPauseAndBoonsAcrossSwiftBoundary() throws {
        let host=try host()
        try host.call("start",["daily",123,0]);try host.call("debug",["god"]);try host.call("debug",["boon"])
        let frame=try host.tick(milliseconds:16,pose:touch)
        XCTAssertEqual(frame.ui["boons"].array.count,2)
        try host.call("choose",[0]);try host.call("pause",[true])
        let paused=try host.tick(milliseconds:4000,pose:touch)
        XCTAssertEqual(frame.time,paused.time);XCTAssertEqual(paused.ui["boons"].array.count,0);XCTAssertTrue(paused.paused)
    }
    func testCameraSignsAndTouchReportExclusion() throws {
        let host=try host();try host.call("start",["casual",100,0])
        let face:JSONValue = .object(["hasFace":.bool(true),"usingTouch":.bool(false),"rYaw":.number(13),"rPitch":.number(0),"rRoll":.number(0),"rZ":.number(0)])
        let frame=try host.tick(milliseconds:16,pose:face)
        XCTAssertLessThan(frame.nodes.first{$0.kind=="ship"}!.p[0],0)
        host.context.evaluateScript("head.usingTouch=true;require('report').beginReport('casual');require('report').reportTick(100,true,false)")
        let report=try JSONValue.parse(host.context.evaluateScript("JSON.stringify(require('report').buildReport(1000))").toString())
        XCTAssertTrue(report["touch"].bool);XCTAssertEqual(report["stretchScore"].int,0);XCTAssertEqual(report["moveSec"].int,0)
    }
}
