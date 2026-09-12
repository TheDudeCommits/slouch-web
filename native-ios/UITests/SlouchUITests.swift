import XCTest

final class SlouchUITests:XCTestCase {
    override func setUpWithError() throws {continueAfterFailure=false;XCUIDevice.shared.orientation = .portrait}
    private func launch(_ args:[String]=[])->XCUIApplication {
        let app=XCUIApplication();app.launchArguments=["-qa-test"]+args;app.launch()
        XCTAssertTrue(app.buttons["play-techneck"].waitForExistence(timeout:30))
        return app
    }
    private func capture(_ name:String,_ app:XCUIApplication) {
        // Capture the physical screen: app.screenshot() crops rotated surfaces
        // incorrectly on this simulator runtime despite correct window geometry.
        let attachment=XCTAttachment(screenshot:XCUIScreen.main.screenshot());attachment.name=name;attachment.lifetime = .keepAlways;add(attachment)
    }
    func testOriginalWorldsRenderAndTouchPauseResumeWorks() {
        for world in ["space","ocean","jungle"] {
            let app=launch(["-touch","-qa-world="+world])
            capture(world+"-menu",app)
            app.buttons["play-techneck"].tap()
            XCTAssertTrue(app.buttons["Pause"].waitForExistence(timeout:15))
            let start=app.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.65))
            let end=app.coordinate(withNormalizedOffset:CGVector(dx:0.68,dy:0.42))
            start.press(forDuration:0.1,thenDragTo:end,withVelocity:.slow,thenHoldForDuration:0.3)
            XCTAssertTrue(app.staticTexts["game-score"].exists)
            capture(world+"-gameplay",app)
            app.buttons["Pause"].tap()
            XCTAssertTrue(app.buttons["RESUME"].waitForExistence(timeout:5))
            app.buttons["RESUME"].tap()
            XCTAssertTrue(app.buttons["Pause"].waitForExistence(timeout:5))
            app.buttons["Pause"].tap();app.buttons["QUIT TO MENU"].tap()
            XCTAssertTrue(app.buttons["play-techneck"].waitForExistence(timeout:5))
            XCUIDevice.shared.orientation = .landscapeLeft
            let rotationSettled=Date().addingTimeInterval(1)
            let landscape=NSPredicate { _,_ in
                let frame=app.windows.firstMatch.frame,button=app.buttons["play-techneck"]
                return Date()>=rotationSettled && frame.width>frame.height && button.isHittable && frame.contains(button.frame)
            }
            XCTAssertEqual(XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:landscape,object:nil)],timeout:8),.completed)
            capture(world+"-landscape-menu",app)
            app.buttons["play-techneck"].tap()
            XCTAssertTrue(app.buttons["Pause"].waitForExistence(timeout:10))
            capture(world+"-landscape-gameplay",app)
            app.buttons["Pause"].tap();app.buttons["QUIT TO MENU"].tap()
            XCUIDevice.shared.orientation = .portrait
            app.terminate()
        }
    }
    func testSpaceHyperdriveRendering() {
        let app=launch(["-touch","-qa-world=space","-qa-hyper"])
        app.buttons["play-techneck"].tap()
        XCTAssertTrue(app.staticTexts["HYPERDRIVE"].firstMatch.waitForExistence(timeout:15))
        let settled=Date().addingTimeInterval(1)
        let ready=NSPredicate { _,_ in Date()>=settled }
        XCTAssertEqual(XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:ready,object:nil)],timeout:3),.completed)
        capture("space-hyperdrive",app)
        app.buttons["Pause"].tap()
        XCTAssertTrue(app.buttons["RESUME"].waitForExistence(timeout:5))
        app.terminate()
    }
    func testCameraFallbackAndWorldPurchase() {
        let app=launch()
        app.buttons["play-techneck"].tap()
        XCTAssertTrue(app.buttons["USE TOUCH CONTROLS"].waitForExistence(timeout:10))
        capture("camera-fallback",app)
        app.buttons["USE TOUCH CONTROLS"].tap()
        XCTAssertTrue(app.buttons["Pause"].waitForExistence(timeout:10))
        app.buttons["Pause"].tap();app.buttons["QUIT TO MENU"].tap()
        app.buttons["STORE"].tap()
        XCTAssertTrue(app.buttons["buy-world_ocean"].waitForExistence(timeout:5))
        app.buttons["buy-world_ocean"].tap()
        XCTAssertTrue(app.staticTexts["EQUIPPED"].waitForExistence(timeout:10))
        capture("ocean-purchased",app)
        app.buttons["Back"].tap()
        XCTAssertTrue(app.buttons["play-techneck"].waitForExistence(timeout:5))
        app.terminate()
    }
    func testRealCollisionResultsAndNativeShareSheet() {
        let app=launch(["-touch"])
        app.buttons["play-techneck"].tap()
        XCTAssertTrue(app.buttons["REPORT"].waitForExistence(timeout:90),"An unsteered original run must end through the collision engine")
        capture("collision-results",app)
        app.buttons["REPORT"].tap()
        XCTAssertTrue(app.buttons["SHARE REPORT"].waitForExistence(timeout:5))
        capture("touch-report",app)
        app.buttons["SHARE REPORT"].tap()
        XCTAssertTrue(app.otherElements["ActivityListView"].waitForExistence(timeout:10))
        XCTAssertTrue(app.cells["Copy"].exists)
        capture("native-share-sheet",app)
        app.terminate()
    }
}
