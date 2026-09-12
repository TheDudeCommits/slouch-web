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
    private var raw = SIMD4<Double>.zero
    private var neutral = SIMD4<Double>.zero
    private var initializedPose = false
    private var lostFrames = 0
    private var previewFrame = 0
    private let imageContext = CIContext()
    private var samples: [SIMD4<Double>] = []
    private var isCalibrating = false
    var pose: JSONValue {
        let r = raw - neutral
        return .object(["ready": .bool(ready), "hasFace": .bool(hasFace), "usingTouch": .bool(usingTouch),
                        "rYaw": .number(wrapped(r.x)), "rPitch": .number(wrapped(r.y)), "rRoll": .number(wrapped(r.z)), "rZ": .number(r.w),
                        "touchX": .number(touchX), "touchY": .number(touchY)])
    }
    private func wrapped(_ angle: Double) -> Double { atan2(sin(angle * .pi / 180), cos(angle * .pi / 180)) * 180 / .pi }
    func start() async -> Bool {
        message="";hasFace=false;lostFrames=0
        guard ARFaceTrackingConfiguration.isSupported else { message = "Head tracking needs a supported iPhone or iPad. You can play with touch controls."; return false }
        guard await AVCaptureDevice.requestAccess(for: .video) else { message = "Camera access is off. Enable it in iOS Settings or use touch controls."; return false }
        session.delegate = self
        let config = ARFaceTrackingConfiguration(); config.isLightEstimationEnabled = false
        session.run(config, options: [.resetTracking, .removeExistingAnchors])
        usingTouch = false; ready = true; initializedPose = false
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
        neutral = samples.reduce(.zero,+) / Double(samples.count)
        message = "CALIBRATED"; return true
    }
    nonisolated func session(_ session: ARSession, didUpdate frame: ARFrame) {
        let face = frame.anchors.compactMap { $0 as? ARFaceAnchor }.first
        let transform = face.map { simd_inverse(frame.camera.transform) * $0.transform }
        let tracked = face?.isTracked ?? false
        let buffer = frame.capturedImage
        Task { @MainActor [weak self] in self?.consume(transform, tracked: tracked, buffer: buffer) }
    }
    private func consume(_ m: simd_float4x4?, tracked: Bool, buffer: CVPixelBuffer) {
        previewFrame += 1
        if previewEnabled && previewFrame % 6 == 0 {
            let image = CIImage(cvPixelBuffer: buffer).oriented(.leftMirrored)
            if let cg = imageContext.createCGImage(image, from: image.extent) { preview = UIImage(cgImage: cg) }
        }
        guard tracked, let m else { lostFrames += 1; if lostFrames > 12 { hasFace = false }; return }
        lostFrames = 0; hasFace = true
        let d = 180.0 / Double.pi
        let p = SIMD4(Double(atan2(m.columns.2.x,m.columns.2.z))*d, Double(asin(max(-1,min(1,-m.columns.2.y))))*d, Double(atan2(m.columns.0.y,m.columns.1.y))*d,Double(m.columns.3.z)*100)
        if !initializedPose { raw = p; initializedPose = true }
        else {
            for i in 0..<4 {
                let delta = i < 3 ? wrapped(p[i]-raw[i]) : p[i]-raw[i]
                raw[i] += delta * min(0.85,0.2+abs(delta)*(i == 3 ? 0.14 : 0.06))
            }
        }
        if isCalibrating { samples.append(raw) }
    }
    nonisolated func session(_ session: ARSession, didFailWithError error: Error) {
        let description = error.localizedDescription
        Task { @MainActor [weak self] in self?.hasFace = false; self?.message = description }
    }
    nonisolated func sessionWasInterrupted(_ session: ARSession) {
        Task { @MainActor [weak self] in self?.hasFace = false; self?.message = "Camera interrupted. Recalibrate to continue." }
    }
}
