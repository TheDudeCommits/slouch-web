import Capacitor
import ARKit
import AVFoundation
import CoreImage
import UserNotifications

/// Frames and geometry never leave this process. Only camera-relative angles,
/// depth in centimetres, and freshness cross the in-process JavaScript bridge.
@objc(SlouchNativePlugin)
public final class SlouchNativePlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "SlouchNativePlugin"
    public let jsName = "SlouchNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "support", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reminder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "haptic", returnType: CAPPluginReturnPromise)
        ,CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise)
    ]
    private let session = ARSession()
    private let imageContext = CIContext(options: [.cacheIntermediates: false])
    private var running = false
    private var preview = false
    private var lastPose: TimeInterval = 0
    private var lastPreview: TimeInterval = 0
    private var backgroundObserver: NSObjectProtocol?
    private var saveURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("slouch-progress.json")
    }
    public override func load() {
        session.delegate = self
        session.delegateQueue = .main
        backgroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.halt()
        }
    }
    deinit { if let backgroundObserver { NotificationCenter.default.removeObserver(backgroundObserver) }; session.pause() }
    @objc func support(_ call: CAPPluginCall) {
        call.resolve(["faceTracking": ARFaceTrackingConfiguration.isSupported, "provider": "arkit"])
    }
    @objc func startTracking(_ call: CAPPluginCall) {
        guard ARFaceTrackingConfiguration.isSupported else { call.reject("Face tracking is unavailable on this device."); return }
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                guard granted else { call.reject("Camera access is off."); return }
                let configuration = ARFaceTrackingConfiguration()
                configuration.isLightEstimationEnabled = false
                configuration.maximumNumberOfTrackedFaces = 1
                self.lastPose = 0; self.running = true
                self.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
                UIApplication.shared.isIdleTimerDisabled = true
                call.resolve()
            }
        }
    }
    private func halt() {
        session.pause(); running = false; preview = false
        UIApplication.shared.isIdleTimerDisabled = false
        notifyListeners("pose", data: ["valid": false, "ageMs": 0])
    }
    @objc func stopTracking(_ call: CAPPluginCall) { DispatchQueue.main.async { self.halt(); call.resolve() } }
    @objc func setPreview(_ call: CAPPluginCall) { preview = call.getBool("enabled") ?? false; call.resolve() }
    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard running, frame.timestamp - lastPose >= 1.0 / 30.0 else { return }
        lastPose = frame.timestamp
        guard let face = frame.anchors.compactMap({ $0 as? ARFaceAnchor }).first, face.isTracked else {
            notifyListeners("pose", data: ["valid": false, "ageMs": 0]); return
        }
        let orientation = bridge?.viewController?.view.window?.windowScene?.interfaceOrientation ?? .portrait
        // View matrix rotates into the currently displayed screen orientation.
        let matrix = frame.camera.viewMatrix(for: orientation) * face.transform
        let degrees: Float = 180 / .pi
        let yaw = atan2(matrix.columns.2.x, matrix.columns.2.z) * degrees
        let pitch = asin(max(-1, min(1, -matrix.columns.2.y))) * degrees
        let roll = atan2(matrix.columns.0.y, matrix.columns.1.y) * degrees
        let depth = matrix.columns.3.z * 100
        guard [yaw, pitch, roll, depth].allSatisfy(\.isFinite) else { return }
        let age = max(0, (ProcessInfo.processInfo.systemUptime - frame.timestamp) * 1000)
        notifyListeners("pose", data: ["valid": true, "yaw": yaw, "pitch": pitch, "roll": roll, "z": depth, "ageMs": age])
        if preview && frame.timestamp - lastPreview > 0.25 {
            lastPreview = frame.timestamp
            let rotation: CGImagePropertyOrientation = orientation == .landscapeLeft ? .downMirrored : orientation == .landscapeRight ? .upMirrored : .leftMirrored
            let image = CIImage(cvPixelBuffer: frame.capturedImage).oriented(rotation)
            let resized = image.transformed(by: CGAffineTransform(scaleX: 240 / image.extent.width, y: 240 / image.extent.width))
            if let data = imageContext.jpegRepresentation(of: resized, colorSpace: CGColorSpaceCreateDeviceRGB(), options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.65]) {
                notifyListeners("preview", data: ["image": "data:image/jpeg;base64," + data.base64EncodedString()])
            }
        }
    }
    public func sessionWasInterrupted(_ session: ARSession) { halt() }
    public func session(_ session: ARSession, didFailWithError error: Error) { halt() }
    @objc func save(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), let data = value.data(using: .utf8), data.count <= 2_000_000 else { call.reject("Invalid save."); return }
        do {
            try FileManager.default.createDirectory(at: saveURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: saveURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            call.resolve()
        } catch { call.reject("Could not save progress.", nil, error) }
    }
    @objc func load(_ call: CAPPluginCall) {
        guard FileManager.default.fileExists(atPath: saveURL.path) else { call.resolve(["value": NSNull()]); return }
        do { call.resolve(["value": try String(contentsOf: saveURL, encoding: .utf8)]) }
        catch { call.reject("Could not read progress.", nil, error) }
    }
    @objc func reminder(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["slouch-break"])
        guard call.getBool("enabled") == true else { call.resolve(["granted": false]); return }
        center.requestAuthorization(options: [.alert, .sound]) { granted, error in
            guard granted else { call.resolve(["granted": false]); return }
            let content = UNMutableNotificationContent()
            content.title = "A little time for you."
            content.body = "Your next little escape is ready when you are."
            content.sound = .default
            center.add(UNNotificationRequest(identifier: "slouch-break", content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 4 * 3600, repeats: false))) { error in
                if let error { call.reject("Could not schedule reminder.", nil, error) }
                else { call.resolve(["granted": true]) }
            }
        }
    }
    @objc func haptic(_ call: CAPPluginCall) {
        DispatchQueue.main.async { UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.55); call.resolve() }
    }
    @objc func shareFile(_ call: CAPPluginCall) {
        guard let encoded=call.getString("base64"),let data=Data(base64Encoded:encoded),data.count<10_000_000 else { call.reject("Invalid share file.");return }
        let name=(call.getString("name") ?? "slouch-progress.json") as NSString
        let file=FileManager.default.temporaryDirectory.appendingPathComponent(name.lastPathComponent)
        do { try data.write(to:file,options:.atomic) } catch { call.reject("Could not prepare the file.");return }
        DispatchQueue.main.async {
            let sheet=UIActivityViewController(activityItems:[file],applicationActivities:nil)
            sheet.popoverPresentationController?.sourceView=self.bridge?.viewController?.view
            sheet.popoverPresentationController?.sourceRect=self.bridge?.viewController?.view.bounds ?? .zero
            sheet.completionWithItemsHandler={ _,completed,_,error in
                try? FileManager.default.removeItem(at:file)
                if let error {call.reject("Sharing failed.",nil,error)}else{call.resolve(["completed":completed])}
            }
            self.bridge?.viewController?.present(sheet,animated:true)
        }
    }
}
