import RealityKit
import SwiftUI
import Metal
import MetalPerformanceShaders

private struct AnimationRoot: Component {}

@MainActor final class WorldRenderer {
    let view = ARView(frame: .zero, cameraMode: .nonAR, automaticallyConfigureSession: false)
    private let root = AnchorEntity(world: .zero)
    private let scenery = Entity(), sky = Entity()
    private let camera = PerspectiveCamera()
    private var backgroundPlane: ModelEntity?
    private var flareSun = SIMD3<Float>(420,260,-1100)
    private var lensFlares: [(ModelEntity,Float,Float)] = []
    private var contactShadow: ModelEntity?
    private let shield = ModelEntity(mesh: .generateSphere(radius: 2.2))
    private var nodes: [Int: Entity] = [:], appearances: [Int: String] = [:]
    private var animations: [Int: (String,AnimationPlaybackController)] = [:]
    private var prototypes: [String: Entity] = [:], textures: [String: TextureResource] = [:]
    private var decor: [(Entity,Float,Bool)] = [], particles: [(Entity,Float)] = []
    private var trail: [ModelEntity] = [], trailPath: [SIMD3<Float>] = []
    private var scrolling: [ModelEntity] = []
    private var lastGameTime: Double = 0
    private var explosions: [(Entity,SIMD3<Float>,Float)] = []
    private var revision = -1, world = "space"
    private var lastTime: Double = 0, elapsed: Float = 0
    private var save: JSONValue = .null, catalog: JSONValue = .null
    private var manifest: [String: AssetDefinition]
    private let resources: URL
    private var pipeline: MTLComputePipelineState?
    private var thresholdPipeline: MTLComputePipelineState?
    private var bloomTextures: [(MTLTexture,MTLTexture)] = []
    private var bloomSize = SIMD2<Int>.zero
    private var postFrames = 0
    private var glow: TextureResource?
    private var post = SIMD4<Float>(0,0,0.0025,0), fog = SIMD4<Float>(0.02,0.0235,0.0588,1)
    private var speedTint = SIMD4<Float>(0.55,0.85,1,1)
    var onError: ((String)->Void)?

    init(resources: URL) throws {
        self.resources = resources
        AnimationRoot.registerComponent()
        manifest = try JSONDecoder().decode([String: AssetDefinition].self, from: Data(contentsOf: resources.appendingPathComponent("Models/manifest.json")))
        view.environment.background = .color(UIColor(hex:0x05060f))
        view.renderOptions = [.disableMotionBlur, .disableDepthOfField, .disableCameraGrain]
        view.environment.lighting.intensityExponent = 0.5
        root.addChild(scenery); root.addChild(sky); root.addChild(camera); root.addChild(shield)
        camera.camera.fieldOfViewInDegrees = 72; camera.camera.near = 0.1; camera.camera.far = 3000
        let sun = DirectionalLight(); sun.light.intensity = 2500; sun.light.color = UIColor(hex:0xfff4e0)
        sun.look(at: [0,0,-20], from: [6,12,6], relativeTo: nil); root.addChild(sun)
        let fill = PointLight(); fill.position = [0,7,4]; fill.light.intensity = 1400; fill.light.attenuationRadius = 65; root.addChild(fill)
        view.scene.addAnchor(root)
    }
    func configure(save: JSONValue, catalog: JSONValue) { self.save = save; self.catalog = catalog }
    private func texture(_ name: String) throws -> TextureResource {
        if let t = textures[name] { return t }
        let t = try TextureResource.load(contentsOf: resources.deletingLastPathComponent().appendingPathComponent("assets/"+name), options: .init(semantic: .color))
        textures[name] = t; return t
    }
    private func prototype(_ key: String, clip: String? = nil) throws -> Entity {
        let cache = key + ":" + (clip ?? "")
        if let e = prototypes[cache] { return e }
        guard let a = manifest[key] else { throw GameKernel.KernelError.message("Missing original model: \(key)") }
        let file = clip.flatMap { a.clips[$0] } ?? a.file
        let entity = try Entity.load(contentsOf: resources.appendingPathComponent("Models/"+file))
        prototypes[cache] = entity; return entity
    }
    private func model(_ key: String, length: Float? = nil, radius: Float? = nil, yaw: Float = 0, shipLength: Float? = nil) throws -> Entity {
        let e = try prototype(key).clone(recursive:true), def = manifest[key]!
        let scale = shipLength.map { $0 / max(0.001,def.size[2]) } ?? length.map { $0 / max(0.001,def.size.max()!) } ?? radius.map { $0 / max(0.001,def.radius) } ?? 1
        e.components.set(AnimationRoot())
        e.position -= SIMD3(def.center[0],def.center[1],def.center[2])
        let inner = Entity(); inner.addChild(e); inner.scale = SIMD3(repeating:scale); inner.orientation = simd_quatf(angle:yaw,axis:[0,1,0])
        let holder = Entity(); holder.addChild(inner)
        tuneMaterials(holder,pack:key.hasPrefix("packs__"),hero:false)
        return holder
    }
    /// Match the original pack loader's matte surfaces and self illumination.
    private func tuneMaterials(_ e:Entity,pack:Bool,hero:Bool) {
        if var component=e.components[ModelComponent.self] {
            component.materials=component.materials.map { material in
                guard var m=material as? PhysicallyBasedMaterial else{return material}
                if pack {
                    m.metallic=0.0;m.roughness.scale=max(0.85,m.roughness.scale)
                    m.emissiveColor = .init(color:m.baseColor.tint,texture:m.baseColor.texture)
                    m.emissiveIntensity=hero ? 0.32:0.18
                } else {m.metallic.scale=min(0.6,m.metallic.scale);m.roughness.scale=max(0.35,m.roughness.scale)}
                return m
            };e.components.set(component)
        }
        for child in e.children {tuneMaterials(child,pack:pack,hero:hero)}
    }
    private func glowMaterial(_ color:UIColor,opacity:Float=0.6) throws -> UnlitMaterial {
        if glow == nil {
            glow=try generatedTexture(CGSize(width:64,height:64)){g in
                let colors=[UIColor.white.cgColor,UIColor.white.withAlphaComponent(0.5).cgColor,UIColor.clear.cgColor]
                g.drawRadialGradient(CGGradient(colorsSpace:CGColorSpaceCreateDeviceRGB(),colors:colors as CFArray,locations:[0,0.35,1])!,startCenter:CGPoint(x:32,y:32),startRadius:0,endCenter:CGPoint(x:32,y:32),endRadius:32,options:.drawsAfterEndLocation)
            }
        }
        var m=UnlitMaterial();m.color = .init(tint:color,texture:.init(glow!));m.blending = .transparent(opacity:.init(floatLiteral:opacity));m.faceCulling = .none
        return m
    }
    private func box(_ size: SIMD3<Float>, _ color: UIColor) -> ModelEntity {
        var material=UnlitMaterial(color:color)
        if color.cgColor.alpha<1 {material.blending = .transparent(opacity:.init(floatLiteral:Float(color.cgColor.alpha)))}
        return ModelEntity(mesh:.generateBox(size:size),materials:[material])
    }
    private func makeNode(_ n: NodeSnapshot) throws -> Entity {
        let e: Entity
        if let asset = n.asset, asset != "rock" { e = try model(asset,length:n.len,radius:n.radius,yaw:n.yaw,shipLength:n.shipLength) }
        else if n.kind == "asteroid" {
            e = try model(n.id % 2 == 0 ? "rock__rock1" : "rock__rock2",radius:n.radius)
            var m = PhysicallyBasedMaterial()
            m.baseColor = .init(tint:UIColor(hex:catalog["THEMES"][save["equippedTheme"].string]["colors"]["rock"].int),texture:.init(try texture("rock/color.jpg")))
            m.roughness = 0.95; m.metallic = 0.05; m.normal.texture = .init(try texture("rock/normal.jpg")); setMaterials(e,[m])
        } else if n.kind == "gate" {
            e = try model("pickups__gate",radius:7.5); e.orientation = simd_quatf(angle:.pi/2,axis:[1,0,0])
            setMaterials(e,[UnlitMaterial(color:UIColor(hex:0xffb02c))])
        } else if n.kind == "wall" {
            e=Entity()
            let axis=n.gapAxis ?? "x", span:Float=axis == "x" ? 17:10, center=n.gapCenter ?? 0
            var p = -span
            while p <= span {
                if abs(p-center) >= 3.6 {
                    let beam=box(axis == "x" ? [0.28,22.4,0.28]:[36.4,0.28,0.28],wallColor)
                    beam.position=axis == "x" ? [p,0,0]:[0,p,0];e.addChild(beam)
                }
                p += span/4.6
            }
        } else if n.kind == "boss" {
            e=Entity()
            let hull=SimpleMaterial(color:UIColor(hex:0x3a2a3a),roughness:0.4,isMetallic:true)
            let body=ModelEntity(mesh:try frustum(height:26,top:4,bottom:6,sides:8),materials:[hull]);body.orientation=simd_quatf(angle:.pi/2,axis:[0,0,1]);e.addChild(body)
            for sign:Float in [-1,1] {
                let tower=ModelEntity(mesh:.generateBox(size:[3,7,3]),materials:[hull]);tower.position=[sign*8,5,0];e.addChild(tower)
            }
            let eye=ModelEntity(mesh:.generateSphere(radius:1.6),materials:[UnlitMaterial(color:UIColor(hex:0xff3c5a))]);eye.position=[0,0,6];e.addChild(eye)
        } else {
            e=Entity()
            let hull=SimpleMaterial(color:UIColor(hex:0x662233),roughness:0.3,isMetallic:true)
            let body=ModelEntity(mesh:try frustum(height:2.6,top:0,bottom:0.55,sides:4),materials:[hull]);body.orientation=simd_quatf(angle:.pi/2,axis:[1,0,0]);e.addChild(body)
            for sign:Float in [-1,1] {
                let wing=ModelEntity(mesh:.generateBox(size:[1.7,0.07,0.7]),materials:[hull]);wing.position=[sign*0.95,0,0.5];e.addChild(wing)
            }
            let glow=ModelEntity(mesh:.generatePlane(width:1.4,height:1.4),materials:[try glowMaterial(UIColor(hex:0xff3c5a))]);glow.position=[0,0,-1.4];e.addChild(glow)
        }
        if n.kind == "ship" {tuneMaterials(e,pack:world != "space",hero:true)}
        if n.kind == "ship", world == "jungle" { e.position.y = (n.halfH ?? 1.1)-1.1 }
        let wrapper=Entity();wrapper.addChild(e)
        if n.kind == "ship",world != "jungle" {
            let tail=(n.shipLength ?? n.len ?? 3.6)/2+(world == "space" ? 0.25:0.4)
            let engine=ModelEntity(mesh:.generatePlane(width:1.6,height:1.6),materials:[try glowMaterial(accent,opacity:1)])
            engine.name="billboard";engine.position=[0,0.1,tail];wrapper.addChild(engine)
        }
        if ["gate","crystal","powerup"].contains(n.kind) {
            let color=UIColor(hex:n.kind == "powerup" ? ["magnet":0xffd54d,"focus":0x8ab8ff,"doubler":0xff5ce0,"shard":0x5ce1ff][n.type ?? ""] ?? 0x5ce1ff:0xffd75c)
            let size:Float=n.kind == "gate" ? 14:n.kind == "crystal" ? 3.6:4.5
            let halo=ModelEntity(mesh:.generatePlane(width:size,height:size),materials:[try glowMaterial(color,opacity:n.kind == "gate" ? 0.22:0.5)])
            halo.name="billboard";wrapper.addChild(halo)
        }
        if n.kind == "asteroid",world != "space" {
            let size=max(2.8,(n.radius ?? n.len.map{$0/2.6} ?? 1.5)*2.1)
            let halo=ModelEntity(mesh:.generatePlane(width:size,height:size),materials:[try glowMaterial(UIColor(hex:catalog["PACKS"][world]["env"]["danger"].int),opacity:0.18)])
            halo.name="danger-billboard";halo.position.y = n.bob ? 0:-(n.halfH ?? 1)*0.35;wrapper.addChild(halo)
        }
        return wrapper
    }
    private func animationRoot(_ entity: Entity) -> Entity {
        if entity.components[AnimationRoot.self] != nil { return entity }
        for child in entity.children {
            let found=animationRoot(child)
            if found.components[AnimationRoot.self] != nil {return found}
        }
        return entity
    }
        private func repeated(_ resource:TextureResource)->MaterialParameters.Texture {
        let descriptor=MTLSamplerDescriptor()
        descriptor.sAddressMode = .repeat;descriptor.tAddressMode = .repeat
        descriptor.minFilter = .linear;descriptor.magFilter = .linear;descriptor.mipFilter = .linear
        return .init(resource,sampler:.init(descriptor))
    }
    private func generatedTexture(_ size:CGSize,draw:(CGContext)->Void) throws -> TextureResource {
        let format=UIGraphicsImageRendererFormat();format.scale=1;format.opaque=false
        let image=UIGraphicsImageRenderer(size:size,format:format).image{draw($0.cgContext)}
        return try TextureResource(image:image.cgImage!,options:.init(semantic:.color))
    }
    private func gradientBackground(_ env:JSONValue) throws {
        let colors=env["bg"].array.map { UIColor(hex:Int($0.string.dropFirst(),radix:16) ?? 0).cgColor }
        let texture=try generatedTexture(CGSize(width:1024,height:512)){g in
            let gradient=CGGradient(colorsSpace:CGColorSpaceCreateDeviceRGB(),colors:colors as CFArray,locations:nil)!
            g.drawLinearGradient(gradient,start:.zero,end:CGPoint(x:0,y:512),options:[])
            if self.world == "jungle" {
                for (y,amp,color) in [(0.52,26.0,UIColor(hex:0x94cd6e).withAlphaComponent(0.6)),(0.60,34.0,UIColor(hex:0x6cb254).withAlphaComponent(0.8)),(0.68,44.0,UIColor(hex:0x4a9442).withAlphaComponent(0.95))] {
                    g.setFillColor(color.cgColor);g.beginPath();g.move(to:CGPoint(x:0,y:512))
                    for x in stride(from:0,through:1024,by:8) {
                        let t=Double(x)*0.02
                        let yy=512*y-abs(sin(t*1.7)*0.6+sin(t*0.6+2)*0.4)*amp-(sin(t*5.1)>0.7 ? amp*0.8:0)
                        g.addLine(to:CGPoint(x:Double(x),y:yy))
                    }
                    g.addLine(to:CGPoint(x:1024,y:512));g.closePath();g.fillPath()
                }
            }
        }
        var m=UnlitMaterial();m.color = .init(texture:.init(texture))
        let background=ModelEntity(mesh:.generatePlane(width:1,height:1),materials:[m]);sky.addChild(background);backgroundPlane=background
    }
    private func packEffects(_ frame:FrameSnapshot) throws {
        let env=catalog["PACKS"][world]["env"]
        try gradientBackground(env)
        let rayTexture=try generatedTexture(CGSize(width:64,height:256)){g in
            g.move(to:CGPoint(x:22,y:0));g.addLine(to:CGPoint(x:42,y:0));g.addLine(to:CGPoint(x:58,y:256));g.addLine(to:CGPoint(x:6,y:256));g.closePath();g.clip()
            let colors=[UIColor.white.withAlphaComponent(0.32).cgColor,UIColor.clear.cgColor]
            g.drawLinearGradient(CGGradient(colorsSpace:CGColorSpaceCreateDeviceRGB(),colors:colors as CFArray,locations:nil)!,start:.zero,end:CGPoint(x:0,y:256),options:[])
        }
        for _ in 0..<6 {
            var m=UnlitMaterial();m.color = .init(tint:UIColor(hex:env["ray"].int),texture:.init(rayTexture))
            m.blending = .transparent(opacity:.init(floatLiteral:Float(env["rayOpacity"].number)))
            m.faceCulling = .none
            let ray=ModelEntity(mesh:.generatePlane(width:14,height:90),materials:[m])
            ray.position=[.random(in: -45...45),32,.random(in: -260 ... -60)]
            ray.orientation=simd_quatf(angle:.random(in: -0.25 ... -0.15),axis:[0,0,1]);scenery.addChild(ray)
        }
        if world == "ocean" {
            let caustic=try generatedTexture(CGSize(width:256,height:256)){g in
                g.setStrokeColor(UIColor.white.withAlphaComponent(0.65).cgColor);g.setLineWidth(2.2)
                g.setShadow(offset:.zero,blur:3,color:UIColor.white.cgColor)
                for _ in 0..<26 {
                    let cx=Double.random(in:0...256),cy=Double.random(in:0...256),radius=Double.random(in:18...52)
                    g.beginPath()
                    for a in stride(from:0.0,through:Double.pi*2+0.3,by:0.5) {
                        let r=radius*Double.random(in:0.75...1.25),p=CGPoint(x:cx+cos(a)*r,y:cy+sin(a)*r)
                        if a == 0 {g.move(to:p)}else {g.addLine(to:p)}
                    };g.strokePath()
                }
            }
            var m=UnlitMaterial();m.color = .init(tint:UIColor(hex:0xbfefff),texture:repeated(caustic));m.blending = .transparent(opacity:.init(floatLiteral:0.16));m.textureCoordinateTransform.scale=[9,80]
            let sheet=ModelEntity(mesh:.generatePlane(width:140,depth:1200),materials:[m]);sheet.position=[0,frame.floorY+2.1,-400];scenery.addChild(sheet);scrolling.append(sheet)
            for i in 0..<16 {
                let size:Float = .random(in:0.5...2.1),stone=try model(i%2 == 0 ? "rock__rock1":"rock__rock2",radius:size)
                setMaterials(stone,[SimpleMaterial(color:UIColor(hex:0xd8c49c),roughness:1,isMetallic:false)])
                stone.position=[.random(in: -30...30),frame.floorY+size*0.45,-20-Float(i)*27];scenery.addChild(stone);decor.append((stone,0,false))
            }
        }
    }

    private func setMaterials(_ e: Entity, _ materials: [any RealityKit.Material]) {
        if var component=e.components[ModelComponent.self] { component.materials=materials;e.components.set(component) }
        for child in e.children { setMaterials(child,materials) }
    }
    private var wallColor: UIColor { UIColor(hex:world == "space" ? 0xff3c5a:catalog["PACKS"][world]["wallColor"].int) }
    private var accent: UIColor {
        if world != "space" { return UIColor(hex:catalog["PACKS"][world]["env"]["accent"].int) }
        let color=catalog["TRAILS"][save["equipped"]["trail"].string]["color"]
        if color.string == "rainbow" {return UIColor(hue:CGFloat((elapsed*0.12).truncatingRemainder(dividingBy:1)),saturation:0.85,brightness:0.65,alpha:1)}
        if !color.isNull {return UIColor(hex:color.int)}
        return UIColor(hex:catalog["THEMES"][save["equippedTheme"].string]["colors"]["engine"].int)
    }
    private func rebuild(_ frame: FrameSnapshot) throws {
        nodes.values.forEach{$0.removeFromParent()};nodes.removeAll();appearances.removeAll();animations.removeAll()
        scenery.children.removeAll();sky.children.removeAll();decor=[];particles=[];scrolling=[];backgroundPlane=nil
        contactShadow?.removeFromParent();contactShadow=nil
        explosions.forEach{$0.0.removeFromParent()};explosions=[]
        trail.forEach{$0.removeFromParent()};trail=[];trailPath=[]
        world=frame.world;revision=frame.revision
        var shieldMaterial=UnlitMaterial(color:accent);shieldMaterial.blending = .transparent(opacity:.init(floatLiteral:0.12));shield.model?.materials=[shieldMaterial]
        let env=catalog["PACKS"][world]["env"]
        speedTint=world == "space" ? SIMD4(0.55,0.85,1,1):rgba(UIColor(hex:env["accent"].int))
        if world == "space" { try backdrop() }
        else {
            view.environment.background = .color(UIColor(hex:world == "ocean" ? 0x5fd0ea:0x9fd8f2))
            fog=rgba(UIColor(hex:env["fogColor"].int));post.z=Float(env["fogDensity"].number)
            let floor=try floorMesh(dunes:world == "ocean", textureName:"packs/\(world)/floor.jpg", tint:UIColor(hex:env["floorTint"].int))
            floor.position=[0,frame.floorY,-400];scenery.addChild(floor);scrolling.append(floor)
            try packEffects(frame)
            if world == "jungle" {
                var shadowMaterial=UnlitMaterial(color:UIColor(hex:0x0a1a08))
                shadowMaterial.blending = .transparent(opacity:.init(floatLiteral:0.32))
                let shadow=ModelEntity(mesh:try annulus(inner:0,outer:1.15,sides:20),materials:[shadowMaterial])
                shadow.orientation=simd_quatf(angle:-.pi/2,axis:[1,0,0]);root.addChild(shadow);contactShadow=shadow
                var m=PhysicallyBasedMaterial()
                m.baseColor = .init(tint:UIColor(hex:0xffe8b0),texture:repeated(try texture("packs/jungle/floor.jpg")))
                m.roughness=1.0; m.textureCoordinateTransform.scale=[1.4,120]
                let path=ModelEntity(mesh:.generatePlane(width:9,depth:1200),materials:[m]);path.position=[0,frame.floorY+0.05,-400];scenery.addChild(path);scrolling.append(path)
            }
            let list=catalog["PACKS"][world]["decor"].array.map{$0.string.replacingOccurrences(of:".glb",with:"")}
            let count=world == "ocean" ? 36:30
            for i in 0..<count {
                let length:Float = i%5 == 0 ? .random(in:12...17):.random(in:4.5...10.5)
                let key="packs__\(world)__\(list[i%list.count])", e=try model(key,length:length)
                let d=manifest[key]!,height=d.size[1]*length/max(0.001,d.size.max()!)/2
                let side:Float=i%2 == 0 ? -1:1,near=i%4<2
                e.position=[side*(near ? .random(in:15...21):.random(in:25...38)),frame.floorY+height,-20-Float(i)*(440/Float(count))]
                e.orientation=simd_quatf(angle:.random(in:0...2 * .pi),axis:[0,1,0]);scenery.addChild(e);decor.append((e,Float.random(in:0...6),false))
            }
            if world == "ocean" {
                for i in 0..<13 {
                    let key="packs__ocean__"+["hero_tang","hero_mandarin","hero_clown"][i%3]
                    let e=try model(key,length:.random(in:1.6...3.4),yaw:.pi/2)
                    e.position=[.random(in: -50 ... -30),.random(in: -6...8),.random(in: -280 ... -60)]
                    scenery.addChild(e);decor.append((e,Float.random(in:3...6),true))
                    if let animation=try prototype(key,clip:"Swimming_Normal").availableAnimations.first {animationRoot(e).playAnimation(animation.repeat())}
                }
                let surface=box([400,0.02,1200],UIColor(hex:0xeaffff).withAlphaComponent(0.16));surface.position=[0,16,-400];scenery.addChild(surface)
            }
        }
        let dustMaterial=try glowMaterial(world == "space" ? UIColor(hex:0x8fb8ff):UIColor(hex:env["particle"].int),opacity:0.5)
        let dustMesh=MeshResource.generatePlane(width:0.14,height:0.14)
        for _ in 0..<300 {
            let p=ModelEntity(mesh:dustMesh,materials:[dustMaterial])
            p.position=[.random(in: -22...22),.random(in: -13...13),.random(in: -210...10)];scenery.addChild(p);particles.append((p,Float.random(in:0.6...1.4)))
        }
        if world == "space" {
            let starMesh=MeshResource.generatePlane(width:0.55,height:0.55),material=try glowMaterial(UIColor(hex:0xcfe4ff),opacity:0.7)
            for _ in 0..<1200 {
                let angle=Float.random(in:0...2 * .pi),radius=Float.random(in:24...154)
                let p=ModelEntity(mesh:starMesh,materials:[material]);p.position=[cos(angle)*radius,sin(angle)*radius,.random(in: -550...50)]
                scenery.addChild(p);particles.append((p,-1.35))
            }
        }
        let trailMaterial=try glowMaterial(world == "ocean" ? UIColor(hex:0xcfeaff):accent),trailMesh=MeshResource.generatePlane(width:0.36,height:0.36)
        for _ in 0..<60 {let p=ModelEntity(mesh:trailMesh,materials:[trailMaterial]);root.addChild(p);trail.append(p)}
    }
    private func floorMesh(dunes: Bool, textureName: String, tint: UIColor) throws -> ModelEntity {
        var vertices:[SIMD3<Float>]=[],uvs:[SIMD2<Float>]=[],indices:[UInt32]=[]
        let nx=28,nz=140
        for z in 0...nz { for x in 0...nx {
            let xx=Float(x)/Float(nx)*140-70,zz=Float(z)/Float(nz)*1200-600
            let yy:Float=dunes ? sin(xx*0.09)*sin(zz*0.045+xx*0.02)*1.5+sin(xx*0.23+zz*0.11)*0.45:0
            vertices.append([xx,yy,zz]);uvs.append([Float(x)/Float(nx)*10,Float(z)/Float(nz)*120])
            if z<nz && x<nx {let a=UInt32(z*(nx+1)+x),b=a+UInt32(nx+1);indices += [a,b,a+1,a+1,b,b+1]}
        }}
        var mesh=MeshDescriptor()
        mesh.positions=MeshBuffers.Positions(vertices);mesh.textureCoordinates=MeshBuffers.TextureCoordinates(uvs);mesh.primitives = .triangles(indices)
        var m=PhysicallyBasedMaterial();m.baseColor = .init(tint:tint,texture:repeated(try texture(textureName)));m.roughness=1.0
        return ModelEntity(mesh:try MeshResource.generate(from:[mesh]),materials:[m])
    }
    func backdrop() throws {
        guard world == "space" else{return};sky.children.removeAll();lensFlares=[]
        let theme=catalog["THEMES"][save["equippedTheme"].string],name=theme["sky"].array.randomElement()?.string ?? "space"
        fog=rgba(UIColor(hex:theme["colors"]["fog"].int));post.z=0.0025
        let faces:[(String,SIMD3<Float>,SIMD3<Float>)]=[
            ("back",[0,0,-1100],[0,0,0]),("front",[0,0,1100],[0,.pi,0]),
            ("left",[-1100,0,0],[0,.pi/2,0]),("right",[1100,0,0],[0,-.pi/2,0]),
            ("top",[0,1100,0],[.pi/2,0,0]),("bottom",[0,-1100,0],[-.pi/2,0,0])]
        for (file,pos,rot) in faces {
            var m=UnlitMaterial();m.color = .init(tint:.white,texture:.init(try texture("sky/\(name)/\(file).jpg")))
            let plane=ModelEntity(mesh:.generatePlane(width:2200,height:2200),materials:[m]);plane.position=pos;plane.orientation=quaternion(rot);sky.addChild(plane)
        }
        if let p=theme["planets"].array.randomElement(),!p.isNull {
            var m=PhysicallyBasedMaterial();let t=try texture("planets/\(p.string).jpg")
            m.baseColor = .init(texture:.init(t));m.roughness=0.9;m.emissiveColor = .init(color:.white,texture:.init(t));m.emissiveIntensity=0.22
            let planet=ModelEntity(mesh:.generateSphere(radius:150),materials:[m])
            planet.scale=SIMD3(repeating:.random(in:0.55...1.45));planet.position=[(Bool.random() ? -1:1)*Float.random(in:180...340),.random(in:20...170),.random(in: -1040 ... -820)];sky.addChild(planet)
            planet.orientation=simd_quatf(angle:.random(in: -0.3...0.3),axis:[0,0,1])
            flareSun=[(planet.position.x<0 ? 1:-1)*Float.random(in:350...550),.random(in:180...340),-1100]
            if p.string == "saturn" {
                var ringMaterial=UnlitMaterial();ringMaterial.color = .init(texture:.init(try texture("planets/saturn_ring.png")));ringMaterial.blending = .transparent(opacity:.init(floatLiteral:0.9));ringMaterial.faceCulling = .none
                let ring=ModelEntity(mesh:try annulus(inner:190,outer:340,sides:96),materials:[ringMaterial]);ring.position=planet.position;ring.scale=planet.scale;ring.orientation=quaternion([.pi/2.35+Float.random(in: -0.15...0.15),0.25,0]);sky.addChild(ring)
            }
        }
        for (file,size,distance) in [("lensflare0",Float(420),Float(0)),("lensflare3",80,0.55),("lensflare3",130,0.8),("lensflare3",55,1.05)] {
            var material=UnlitMaterial();material.color = .init(tint:distance == 0 ? UIColor(hex:theme["sun"].int):.white,texture:.init(try texture("fx/"+file+".png")));material.blending = .transparent(opacity:.init(floatLiteral:0.85))
            let flare=ModelEntity(mesh:.generatePlane(width:1,height:1),materials:[material]);sky.addChild(flare);lensFlares.append((flare,size,distance))
        }
    }
    func update(_ frame: FrameSnapshot, realTime: Double) {
        do {
            // RealityKit creates its active render-camera component after attachment.
            // Installing the callback during ARView initialization dereferences a nil camera.
            if view.window != nil && camera.isActive {
                postFrames += 1
                if postFrames == 4 {installPostprocess()}
            }
            if revision != frame.revision { try rebuild(frame) }
            let rawDt=Float(min(0.05,max(0,realTime-lastTime)));lastTime=realTime
            let dt=frame.running ? Float(max(0,min(0.05,frame.time-lastGameTime))):rawDt
            lastGameTime=frame.time
            let animationScale=rawDt>0 ? dt/rawDt:0
            if !frame.paused {elapsed += dt}
            var active=Set<Int>()
            for n in frame.nodes {
                active.insert(n.id)
                let signature="\(n.asset ?? n.kind):\(n.type ?? ""):\(n.gapAxis ?? ""):\(n.gapCenter ?? 0)"
                if nodes[n.id] == nil || appearances[n.id] != signature {
                    nodes[n.id]?.removeFromParent();nodes[n.id]=try makeNode(n);appearances[n.id]=signature;root.addChild(nodes[n.id]!);animations[n.id]=nil
                }
                let e=nodes[n.id]!;e.isEnabled=true;e.position=SIMD3(n.p[0],n.p[1],n.p[2]);e.orientation=quaternion(SIMD3(n.r[0],n.r[1],n.r[2]));e.scale=SIMD3(n.s[0],n.s[1],n.s[2])
                if n.kind == "gate" {e.orientation=simd_quatf(angle:n.direction == "left" ? 0:n.direction == "right" ? .pi:-.pi/2,axis:[0,0,1]);e.scale=SIMD3(repeating:1+sin(elapsed*6)*0.07)}
                if n.bob,let child=e.children.first {child.position.y=sin(elapsed*3+Float(n.id))*0.35}
                for child in e.children where child.name.hasSuffix("billboard") {
                    child.setOrientation(camera.orientation,relativeTo:nil)
                    if child.name == "danger-billboard",let halo=child as? ModelEntity,var material=halo.model?.materials.first as? UnlitMaterial {
                        material.blending = .transparent(opacity:.init(floatLiteral:0.12+abs(sin(elapsed*3+Float(n.id)))*0.10));halo.model?.materials=[material]
                    }
                }
                if let key=n.asset {
                    let clip=n.kind == "ship" ? n.clipMap[frame.heroMotion]:n.clip
                    if let clip {
                        let speed=(n.kind == "ship" ? frame.heroSpeed:1)*n.animSpeed
                        if animations[n.id]?.0 != clip {
                            let source=try prototype(key,clip:clip)
                            if let resource=source.availableAnimations.first {
                                animations[n.id]?.1.stop()
                                let once=n.kind == "ship" && ["jump","land"].contains(frame.heroMotion)
                                let controller=animationRoot(e).playAnimation(once ? resource:resource.repeat(),transitionDuration:0.15);animations[n.id]=(clip,controller)
                            }
                        }
                        animations[n.id]?.1.speed=frame.paused ? 0:speed*animationScale
                    }
                }
                if n.kind == "ship" {
                    shield.position=e.position;shield.isEnabled=frame.ui["shield"].bool
                    if let shadow=contactShadow {
                        let height=max(0,e.position.y - -5.4),scale=max(0.45,1-height*0.07)
                        shadow.position=[e.position.x,-6.46,e.position.z];shadow.scale=SIMD3(repeating:scale);shadow.isEnabled = !frame.over
                        var material=UnlitMaterial(color:UIColor(hex:0x0a1a08));material.blending = .transparent(opacity:.init(floatLiteral:max(0.06,0.32-height*0.03)));shadow.model?.materials=[material]
                    }
                    if !frame.paused {trailPath.insert(e.position+[0,-0.05,1.9],at:0);if trailPath.count>60{trailPath.removeLast()}}
                    if n.bounce,frame.grounded,n.p[1] <= -5.25,let child=e.children.first {child.position.y=(n.halfH ?? 1.1)-1.1+abs(sin(elapsed*(4+frame.speed*0.09)))*0.34}
                }
            }
            for (id,e) in nodes where !active.contains(id) {e.isEnabled=false}
            for (i,p) in trail.enumerated() {p.isEnabled=world != "jungle" && i<trailPath.count && !frame.over;if p.isEnabled {p.position=trailPath[i]+[0,0,Float(i)*0.55];p.orientation=camera.orientation}}
            if !frame.paused {
                for plane in scrolling {
                    guard var component=plane.components[ModelComponent.self] else{continue}
                    component.materials=component.materials.map { material in
                        if var m=material as? PhysicallyBasedMaterial {m.textureCoordinateTransform.offset.y -= frame.speed*dt*0.1;return m}
                        if var m=material as? UnlitMaterial {m.textureCoordinateTransform.offset.y -= frame.speed*dt*0.1;return m}
                        return material
                    };plane.components.set(component)
                }
                for (e,phase,swim) in decor {
                    e.position.z += frame.speed*dt*(swim ? 0.25:1)
                    if swim {e.position.x += phase*dt;e.position.y += sin(elapsed+phase)*dt*1.2;if e.position.x>45 || e.position.z>0 {e.position=[.random(in: -50 ... -35),.random(in: -6...8),.random(in: -280 ... -80)]}}
                    else if e.position.z>20 {e.position.z-=460}
                }
                for (e,v) in particles {
                    e.position.z += frame.speed*dt*(v<0 ? 1.35:world == "space" ? 1.6:1.1);if e.position.z>(v<0 ? 60:12){e.position.z -= v<0 ? 650:240};e.orientation=camera.orientation
                    if world != "space" {e.position.y += (world == "ocean" ? 2.2:0.35)*dt*v;if e.position.y>14{e.position.y-=26}}
                }
                for i in explosions.indices {explosions[i].2-=dt;explosions[i].0.position += (explosions[i].1+[0,0,frame.speed*0.4])*dt;explosions[i].0.scale=SIMD3(repeating:max(0,explosions[i].2/1.4));explosions[i].0.orientation=camera.orientation}
                explosions.filter{$0.2<=0}.forEach{$0.0.removeFromParent()};explosions.removeAll{$0.2<=0}
            }
            let c=frame.camera;camera.camera.fieldOfViewInDegrees=c.fov;camera.look(at:[c.lookX,c.lookY,-30],from:[c.x,c.y,c.z],relativeTo:nil);camera.orientation *= simd_quatf(angle:c.roll,axis:[0,0,1])
            if let background=backgroundPlane {
                let height=2180*tan(c.fov * .pi/360),aspect=Float(view.bounds.width/max(1,view.bounds.height))
                background.position=camera.position+camera.orientation.act([0,0,-1090]);background.orientation=camera.orientation;background.scale=[height*aspect,height,1]
            }
            if world == "space",let point=view.project(flareSun) {
                let visible=view.bounds.contains(point),height=max(1,Float(view.bounds.height)),width=max(1,Float(view.bounds.width))
                let halfHeight=1000*tan(c.fov * .pi/360),halfWidth=halfHeight*width/height
                let ndc=SIMD2(Float(point.x)/width*2-1,1-Float(point.y)/height*2)
                for (flare,size,distance) in lensFlares {
                    flare.isEnabled=visible
                    flare.position=camera.position+camera.orientation.act([ndc.x*(1-2*distance)*halfWidth,ndc.y*(1-2*distance)*halfHeight,-1000])
                    flare.orientation=camera.orientation;flare.scale=SIMD3(repeating:size/height*halfHeight*2)
                }
            }
            post.x=elapsed;post.y=frame.hyper
            if world == "space",save["equipped"]["trail"].string == "trail_rainbow" {
                let color=accent
                for p in trail {if var material=p.model?.materials.first as? UnlitMaterial {material.color.tint=color;p.model?.materials=[material]}}
            }
            for ev in frame.events where ev.kind == "explosion" { explode(ev.data) }
            if frame.events.contains(where:{$0.kind == "backdrop"}) {try backdrop()}
        } catch {onError?(error.localizedDescription)}
    }
    private func explode(_ data: JSONValue) {
        let boom=catalog["BOOMS"][save["equipped"]["boom"].string]
        let color=boom["color"].string == "accent" ? accent:UIColor(hex:boom["color"].int)
        guard let material=try? glowMaterial(color,opacity:1) else{return}
        let size=Float(boom["size"].number)*0.85,mesh=MeshResource.generatePlane(width:size,height:size)
        for _ in 0..<90 {
            let p=ModelEntity(mesh:mesh,materials:[material])
            p.position=[Float(data["x"].number),Float(data["y"].number),Float(data["z"].number)];root.addChild(p)
            let a=Float.random(in:0...2 * .pi),b=acos(Float.random(in: -1...1)),speed=Float.random(in:4...18)
            explosions.append((p,[sin(b)*cos(a)*speed,sin(b)*sin(a)*speed,cos(b)*speed],1.4))
        }
    }
    private func installPostprocess() {
        guard let device=MTLCreateSystemDefaultDevice(),let library=device.makeDefaultLibrary(),let fn=library.makeFunction(name:"slouchPost"),let state=try? device.makeComputePipelineState(function:fn) else {return}
        pipeline=state
        if let threshold=library.makeFunction(name:"slouchBloomThreshold") {thresholdPipeline=try? device.makeComputePipelineState(function:threshold)}
        view.renderCallbacks.postProcess = { [weak self] context in
            guard let self,let pipeline=self.pipeline else{return}
            let size=SIMD2(context.targetColorTexture.width,context.targetColorTexture.height)
            if self.bloomSize != size {
                self.bloomTextures=[];self.bloomSize=size
                for level in 1...5 {
                    let descriptor=MTLTextureDescriptor.texture2DDescriptor(pixelFormat:.rgba16Float,width:max(1,size.x>>level),height:max(1,size.y>>level),mipmapped:false)
                    descriptor.usage=[.shaderRead,.shaderWrite];descriptor.storageMode = .private
                    guard let source=device.makeTexture(descriptor:descriptor),let blurred=device.makeTexture(descriptor:descriptor) else {return}
                    self.bloomTextures.append((source,blurred))
                }
            }
            if let threshold=self.thresholdPipeline {
                for (level,pair) in self.bloomTextures.enumerated() {
                    guard let encoder=context.commandBuffer.makeComputeCommandEncoder() else{return}
                    encoder.setComputePipelineState(threshold);encoder.setTexture(context.sourceColorTexture,index:0);encoder.setTexture(pair.0,index:1)
                    encoder.dispatchThreads(MTLSize(width:pair.0.width,height:pair.0.height,depth:1),threadsPerThreadgroup:MTLSize(width:8,height:8,depth:1));encoder.endEncoding()
                    let blur=MPSImageGaussianBlur(device:device,sigma:Float(3+level*2));blur.edgeMode = .clamp
                    blur.encode(commandBuffer:context.commandBuffer,sourceTexture:pair.0,destinationTexture:pair.1)
                }
            }
            guard let encoder=context.commandBuffer.makeComputeCommandEncoder() else{return}
            var parameters=self.post;var fog=self.fog;var tint=self.speedTint;var inverseProjection=simd_inverse(context.projection)
            encoder.setComputePipelineState(pipeline)
            encoder.setTexture(context.sourceColorTexture,index:0);encoder.setTexture(context.targetColorTexture,index:1);encoder.setTexture(context.sourceDepthTexture,index:2)
            encoder.setBytes(&parameters,length:MemoryLayout<SIMD4<Float>>.stride,index:0);encoder.setBytes(&fog,length:MemoryLayout<SIMD4<Float>>.stride,index:1)
            encoder.setBytes(&inverseProjection,length:MemoryLayout<simd_float4x4>.stride,index:2)
            encoder.setBytes(&tint,length:MemoryLayout<SIMD4<Float>>.stride,index:3)
            for (index,pair) in self.bloomTextures.enumerated() {encoder.setTexture(pair.1,index:3+index)}
            encoder.dispatchThreads(MTLSize(width:context.targetColorTexture.width,height:context.targetColorTexture.height,depth:1),threadsPerThreadgroup:MTLSize(width:8,height:8,depth:1));encoder.endEncoding()
        }
    }
}

private func annulus(inner:Float,outer:Float,sides:Int) throws -> MeshResource {
    var positions:[SIMD3<Float>]=[],uvs:[SIMD2<Float>]=[],indices:[UInt32]=[]
    for i in 0...sides {
        let angle=Float(i)*2 * .pi/Float(sides)
        for (j,radius) in [inner,outer].enumerated() {positions.append([cos(angle)*radius,sin(angle)*radius,0]);uvs.append([Float(j),0.5])}
        if i<sides {let a=UInt32(i*2);indices += [a,a+1,a+2,a+1,a+3,a+2]}
    }
    var d=MeshDescriptor();d.positions=MeshBuffers.Positions(positions);d.textureCoordinates=MeshBuffers.TextureCoordinates(uvs);d.primitives = .triangles(indices)
    return try MeshResource.generate(from:[d])
}
func quaternion(_ e: SIMD3<Float>) -> simd_quatf {
    simd_quatf(angle:e.x,axis:[1,0,0])*simd_quatf(angle:e.y,axis:[0,1,0])*simd_quatf(angle:e.z,axis:[0,0,1])
}
func rgba(_ color: UIColor) -> SIMD4<Float> {
    var r:CGFloat=0,g:CGFloat=0,b:CGFloat=0,a:CGFloat=0;color.getRed(&r,green:&g,blue:&b,alpha:&a);return [Float(r),Float(g),Float(b),Float(a)]
}
extension UIColor {convenience init(hex:Int) {self.init(red:CGFloat((hex>>16)&255)/255,green:CGFloat((hex>>8)&255)/255,blue:CGFloat(hex&255)/255,alpha:1)}}
struct NativeWorldView: UIViewRepresentable {
    let renderer: WorldRenderer
    func makeUIView(context: Context)->ARView {renderer.view}
    func updateUIView(_ view: ARView,context:Context){}
}

private func frustum(height:Float,top:Float,bottom:Float,sides:Int) throws -> MeshResource {
    var positions:[SIMD3<Float>]=[],indices:[UInt32]=[]
    for i in 0..<sides {
        let a=Float(i)*2 * Float.pi/Float(sides)
        positions.append([cos(a)*bottom,-height/2,sin(a)*bottom])
        positions.append([cos(a)*top,height/2,sin(a)*top])
    }
    positions += [[0,-height/2,0],[0,height/2,0]]
    for i in 0..<sides {
        let b=UInt32(i*2),n=UInt32(((i+1)%sides)*2),center=UInt32(sides*2)
        indices += [b,b+1,n,b+1,n+1,n,center,b,n,center+1,n+1,b+1]
    }
    var d=MeshDescriptor();d.positions=MeshBuffers.Positions(positions);d.primitives = .triangles(indices)
    return try MeshResource.generate(from:[d])
}
