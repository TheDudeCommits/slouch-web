import ARKit
import AVFoundation
import Observation
import UIKit

@MainActor @Observable final class HeadTracker: NSObject, ARSessionDelegate {
    let session = ARSession()
    var ready = false
    var hasFace = false
    var usingTouch = false
    var message = ""
    var preview: UIImage?
    var previewEnabled = false
    var touchX = 0.0
    var touchY = 0.0
    private var neutral = matrix_identity_float4x4
    private var filter = HeadPoseFilter()
    private var lastFrameTime = -Double.infinity
    private var lastFaceTime = -Double.infinity
    private var lastPreviewTime = -Double.infinity
    private var orientation = UIInterfaceOrientation.portrait
    private let imageContext = CIContext()
    private var samples: [simd_float4x4] = []
    private var isCalibrating = false
    var pose: JSONValue {
        let r = filter.value
        return .object(["ready": .bool(ready), "hasFace": .bool(hasFace), "usingTouch": .bool(usingTouch),
                        "rYaw": .number(r.x), "rPitch": .number(r.y), "rRoll": .number(r.z), "rZ": .number(r.w),
                        "touchX": .number(touchX), "touchY": .number(touchY)])
    }
    func start() async -> Bool {
        message="";hasFace=false;lastFrameTime = -.infinity;lastFaceTime = -.infinity;filter.reset()
        guard ARFaceTrackingConfiguration.isSupported else { message = "Head tracking needs a supported iPhone or iPad. You can play with touch controls."; return false }
        guard await AVCaptureDevice.requestAccess(for: .video) else { message = "Camera access is off. Enable it in iOS Settings or use touch controls."; return false }
        session.delegate = self
        let config = ARFaceTrackingConfiguration(); config.isLightEstimationEnabled = false
        session.run(config, options: [.resetTracking, .removeExistingAnchors])
        usingTouch = false; ready = true
        message = "Sit tall. Face the camera."
        return true
    }
    func stop() { session.pause(); ready = false; hasFace = false; preview = nil }
    func enableTouch() { stop(); usingTouch = true; hasFace = true; touchX = 0; touchY = 0 }
    func calibrate() async -> Bool {
        samples = []; isCalibrating = true
        try? await Task.sleep(for: .milliseconds(1100))
        isCalibrating = false
        guard !Task.isCancelled else{return false}
        guard samples.count >= 5 else { message = "Face not found. Look toward the camera and try again."; return false }
        guard let center = HeadPose.center(samples) else { return false }
        neutral = center; filter.reset()
        message = "CALIBRATED"; return true
    }
    /// Pull the latest frame once per display tick. Do not enqueue a MainActor
    /// task (and retain a camera buffer) for every AR callback under render load.
    func update(at time: Double, orientation newOrientation: UIInterfaceOrientation) {
        guard ready, !usingTouch else { return }
        guard let frame = session.currentFrame, time - frame.timestamp < 0.4 else {
            hasFace = false; return
        }
        if time - lastFaceTime > 0.4 { hasFace = false }
        guard frame.timestamp > lastFrameTime else { return }
        lastFrameTime = frame.timestamp
        if newOrientation != .unknown && orientation != newOrientation {
            orientation = newOrientation; filter.reset()
            if isCalibrating { samples.removeAll() }
        }
        if previewEnabled && time - lastPreviewTime >= 0.12 {
            lastPreviewTime = time
            let image = CameraPreview.oriented(CIImage(cvPixelBuffer: frame.capturedImage), for: orientation)
            if let cg = imageContext.createCGImage(image, from: image.extent) { preview = UIImage(cgImage: cg) }
        }
        guard let face = frame.anchors.compactMap({ $0 as? ARFaceAnchor }).first, face.isTracked else { return }
        lastFaceTime = frame.timestamp; hasFace = true
        // ARCamera.transform is sensor-oriented. The view matrix corrects it
        // for the current interface orientation before neutral is measured.
        let displayFromFace = frame.camera.viewMatrix(for: orientation) * face.transform
        let relative = HeadPose.relative(displayFromFace: displayFromFace, neutral: neutral)
        filter.update(relative, at: frame.timestamp)
        if isCalibrating { samples.append(displayFromFace) }
    }
    nonisolated func session(_ session: ARSession, didFailWithError error: Error) {
        let description = error.localizedDescription
        Task { @MainActor [weak self] in self?.hasFace = false; self?.message = description }
    }
    nonisolated func sessionWasInterrupted(_ session: ARSession) {
        Task { @MainActor [weak self] in self?.hasFace = false; self?.message = "Camera interrupted. Recalibrate to continue." }
    }
}


/// Apply rotation once, with the horizontal presentation verified relative to
/// the previous device build. Do not mirror again in the SwiftUI image view.
enum CameraPreview {
    static func oriented(_ image: CIImage, for orientation: UIInterfaceOrientation) -> CIImage {
        let imageOrientation: CGImagePropertyOrientation
        switch orientation {
        case .landscapeLeft: imageOrientation = .down
        case .landscapeRight: imageOrientation = .up
        case .portraitUpsideDown: imageOrientation = .left
        default: imageOrientation = .right
        }
        return image.oriented(imageOrientation)
    }
}
