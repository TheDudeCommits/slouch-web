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

import simd

extension GameKernelTests {
    private func rotation(_ degrees: Float, _ axis: SIMD3<Float>) -> simd_float4x4 {
        simd_float4x4(simd_quatf(angle:degrees * .pi / 180,axis:axis))
    }

    func testPhysicalHeadTransformsMoveShipInPlayerDirectionInEveryOrientation() throws {
        // Face +X is the player's LEFT. Positive roll tips their head RIGHT.
        let moves: [(String, SIMD3<Float>, Float, Int, Float)] = [
            ("casual",[0,1,0],-13,0,1), ("casual",[0,1,0],13,0,-1),
            ("techneck",[0,0,1],20,0,1), ("techneck",[0,0,1],-20,0,-1),
            ("casual",[1,0,0],-15,1,1), ("casual",[1,0,0],15,1,-1),
            ("techneck",[1,0,0],-20,1,1), ("techneck",[1,0,0],20,1,-1)
        ]
        for quarterTurn in 0..<4 {
            let screenFromSensor=rotation(Float(quarterTurn)*90,[0,0,1])
            let neutral=rotation(180,[0,1,0])*rotation(8,[1,0,0])
            for (mode,axis,degrees,coordinate,expectedSign) in moves {
                let sensorFromFace=simd_inverse(screenFromSensor)*neutral*rotation(degrees,axis)
                let p=HeadPose.relative(displayFromFace:screenFromSensor*sensorFromFace,neutral:neutral)
                let host=try host();try host.call("start",[mode,123,0])
                let face:JSONValue = .object(["hasFace":.bool(true),"usingTouch":.bool(false),"rYaw":.number(p.x),"rPitch":.number(p.y),"rRoll":.number(p.z),"rZ":.number(p.w)])
                let frame=try host.tick(milliseconds:16,pose:face)
                let ship=frame.nodes.first{$0.kind == "ship"}!
                XCTAssertGreaterThan(ship.p[coordinate]*expectedSign,0,"\(mode), axis \(axis), degrees \(degrees), orientation \(quarterTurn)")
            }
        }
    }

    func testCalibrationAcrossAngleSeamAndChinTuckDepth() throws {
        let center=try XCTUnwrap(HeadPose.center([rotation(179,[0,0,1]),rotation(-179,[0,0,1])]))
        XCTAssertEqual(abs(HeadPose.angles(center).z),180,accuracy:0.01)
        var moved=center;moved.columns.3.z -= 0.04
        let pose=HeadPose.relative(displayFromFace:moved,neutral:center)
        XCTAssertEqual(pose.w,-4,accuracy:0.001)
        XCTAssertEqual(pose.z,0,accuracy:0.001)
    }

    func testTrackingFilterHasLowJitterAndRespondsWithoutFrameRateDependentLag() {
        func trace(fps: Int) -> [Double] {
            var filter=HeadPoseFilter(), result:[Double]=[]
            for i in 0...fps {
                let time=Double(i)/Double(fps)
                // A 20 degree deliberate move in 200 ms, then hold.
                let angle=min(20,max(0,(time-0.2)*100))
                let value=filter.update([angle,0,0,0],at:time).x
                if i % (fps/30) == 0 { result.append(value) }
            }
            return result
        }
        let thirty=trace(fps:30), sixty=trace(fps:60), oneTwenty=trace(fps:120)
        for i in thirty.indices {
            XCTAssertEqual(thirty[i],sixty[i],accuracy:0.8)
            XCTAssertEqual(thirty[i],oneTwenty[i],accuracy:1.1)
        }
        XCTAssertGreaterThan(sixty[15],19,"Reach the deliberate target within 100 ms after the move ends")
        var filter=HeadPoseFilter(), squared=0.0
        for i in 0..<180 {
            let noise=0.3*sin(Double(i)*1.7)
            let value=filter.update([noise,noise,noise,0],at:Double(i)/60).x
            if i>=60 { squared += value*value }
        }
        XCTAssertLessThan(sqrt(squared/120),0.07,"Suppress sub-degree resting jitter")
    }

    func testTrackingFilterRejectsOldFramesAndRecoversFromTrackingGap() {
        var filter=HeadPoseFilter()
        filter.update([179,0,0,0],at:1)
        let next=filter.update([-179,0,0,0],at:1.02)
        XCTAssertGreaterThan(abs(next.x),179,"Take the short route across the wrap seam")
        XCTAssertEqual(filter.update([0,0,0,0],at:1.01),next)
        XCTAssertEqual(filter.update([.nan,0,0,0],at:1.03),next)
        XCTAssertEqual(filter.update([3,0,0,0],at:2).x,3)
    }
}
