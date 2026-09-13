import Foundation
import simd

/// Convert the native camera pose to the original game input contract:
/// +yaw = look left, +pitch = look down, +roll = tilt right.
enum HeadPose {
    static func wrap(_ degrees: Double) -> Double {
        atan2(sin(degrees * .pi / 180), cos(degrees * .pi / 180)) * 180 / .pi
    }

    static func angles(_ transform: simd_float4x4) -> SIMD4<Double> {
        let forward = simd_normalize(transform.columns.2.xyz)
        let up = simd_normalize(transform.columns.1.xyz)
        let degrees = 180.0 / Double.pi
        return [Double(atan2(forward.x, forward.z)) * degrees,
                Double(asin(max(-1, min(1, -forward.y)))) * degrees,
                Double(atan2(-up.x, up.y)) * degrees,
                Double(transform.columns.3.z) * 100]
    }

    static func relative(displayFromFace: simd_float4x4, neutral: simd_float4x4) -> SIMD4<Double> {
        // Measure rotation in the calibrated FACE basis, not global camera
        // Euler axes. A front-facing neutral pose or a tilted phone must not
        // reverse pitch/yaw or couple a head tilt into the other controls.
        let rotation = simd_quatf(neutral).inverse * simd_quatf(displayFromFace)
        var pose = angles(simd_float4x4(rotation))
        // Native camera yaw/roll have the opposite horizontal handedness from
        // the web input. Device feedback confirmed both axes were reversed.
        // Convert here once; the engine's mirror preference still applies later.
        pose.x = -pose.x
        pose.z = -pose.z
        // Positive means closer/slouching; negative means farther/chin tuck.
        pose.w = Double(abs(neutral.columns.3.z) - abs(displayFromFace.columns.3.z)) * 100
        return pose
    }

    /// Average rotations on the same quaternion hemisphere, including poses
    /// either side of the Euler +/-180-degree seam. Store display-aligned neutral
    /// so changing interface orientation does not swap the steering axes.
    static func center(_ samples: [simd_float4x4]) -> simd_float4x4? {
        guard let first = samples.first else { return nil }
        let reference = simd_quatf(first).vector
        var rotation = SIMD4<Float>.zero, position = SIMD4<Float>.zero
        for sample in samples {
            let q = simd_quatf(sample).vector
            rotation += simd_dot(q, reference) < 0 ? -q : q
            position += sample.columns.3
        }
        var result = simd_float4x4(simd_quatf(vector: simd_normalize(rotation)))
        result.columns.3 = position / Float(samples.count)
        return result
    }
}

/// Timestamped adaptive low-pass: quiet at rest, fast during deliberate moves.
/// Time constants are in seconds, independent of camera/display refresh rate.
struct HeadPoseFilter {
    private(set) var value = SIMD4<Double>.zero
    private var previous = SIMD4<Double>.zero
    private var velocity = SIMD4<Double>.zero
    private var timestamp: Double?

    mutating func reset() { self = Self() }

    @discardableResult mutating func update(_ sample: SIMD4<Double>, at time: Double) -> SIMD4<Double> {
        guard sample.x.isFinite, sample.y.isFinite, sample.z.isFinite, sample.w.isFinite, time.isFinite else { return value }
        guard let last = timestamp else {
            value = sample; previous = sample; timestamp = time; return value
        }
        guard time > last else { return value }
        let dt = time - last
        if dt > 0.4 { reset(); return update(sample, at: time) }
        timestamp = time
        let derivativeAlpha = 1 - exp(-2 * .pi * 5 * dt)
        for i in 0..<4 {
            let step = i < 3 ? HeadPose.wrap(sample[i] - previous[i]) : sample[i] - previous[i]
            velocity[i] += (step / dt - velocity[i]) * derivativeAlpha
            let cutoff = min(20, 2.4 + abs(velocity[i]) * (i == 3 ? 0.10 : 0.045))
            let alpha = 1 - exp(-2 * .pi * cutoff * dt)
            let delta = i < 3 ? HeadPose.wrap(sample[i] - value[i]) : sample[i] - value[i]
            value[i] += delta * alpha
            if i < 3 { value[i] = HeadPose.wrap(value[i]) }
        }
        previous = sample
        return value
    }
}

private extension SIMD4 where Scalar == Float {
    var xyz: SIMD3<Float> { [x,y,z] }
}
