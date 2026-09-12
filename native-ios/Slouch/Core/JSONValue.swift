import Foundation

/// Typed JSON at the boundary to the unchanged original game engine.
indirect enum JSONValue: Codable, Equatable, Hashable {
    case object([String: JSONValue]), array([JSONValue]), string(String), number(Double), bool(Bool), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self { case .object(let v): try c.encode(v); case .array(let v): try c.encode(v); case .string(let v): try c.encode(v); case .number(let v): try c.encode(v); case .bool(let v): try c.encode(v); case .null: try c.encodeNil() }
    }
    subscript(_ key: String) -> JSONValue { object[key] ?? .null }
    subscript(_ index: Int) -> JSONValue { array.indices.contains(index) ? array[index] : .null }
    var object: [String: JSONValue] { if case .object(let v) = self { return v }; return [:] }
    var array: [JSONValue] { if case .array(let v) = self { return v }; return [] }
    var string: String { if case .string(let v) = self { return v }; return "" }
    var number: Double { if case .number(let v) = self { return v }; return 0 }
    var int: Int { Int(number) }
    var bool: Bool { if case .bool(let v) = self { return v }; return false }
    var isNull: Bool { self == .null }
    static func parse(_ string: String) throws -> JSONValue { try JSONDecoder().decode(Self.self, from: Data(string.utf8)) }
    var json: String { String(data: (try? JSONEncoder().encode(self)) ?? Data(), encoding: .utf8) ?? "null" }
}
