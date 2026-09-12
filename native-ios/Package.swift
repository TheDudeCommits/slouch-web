// swift-tools-version: 5.9
import PackageDescription
let package = Package(name:"SlouchCore",platforms:[.macOS(.v13)],products:[.library(name:"SlouchCore",targets:["SlouchCore"])],targets:[
    .target(name:"SlouchCore",path:"Slouch/Core",exclude:["SlouchModel.swift"]),
    .testTarget(name:"SlouchCoreTests",dependencies:["SlouchCore"],path:"Tests")
])
