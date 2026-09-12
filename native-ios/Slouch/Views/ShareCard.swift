import SwiftUI
import UIKit

struct SlouchShare:Identifiable {
    let id=UUID()
    let image:UIImage
    let text:String
}
struct ShareActivity:UIViewControllerRepresentable {
    let payload:SlouchShare
    func makeUIViewController(context:Context)->UIActivityViewController {
        UIActivityViewController(activityItems:[payload.image,payload.text],applicationActivities:nil)
    }
    func updateUIViewController(_ controller:UIActivityViewController,context:Context){}
}
@MainActor enum ShareCard {
    /// Direct native translation of report.js drawShareCard, using its original 1080x1350 layout.
    static func render(report:JSONValue,tag:String,duel:Bool)->UIImage {
        let format=UIGraphicsImageRendererFormat();format.scale=1;format.opaque=true
        return UIGraphicsImageRenderer(size:CGSize(width:1080,height:1350),format:format).image{context in
            let g=context.cgContext
            let colors=[UIColor(hex:0x141b3e).cgColor,UIColor(hex:0x05060f).cgColor]
            g.drawRadialGradient(CGGradient(colorsSpace:CGColorSpaceCreateDeviceRGB(),colors:colors as CFArray,locations:nil)!,startCenter:CGPoint(x:540,y:405),startRadius:80,endCenter:CGPoint(x:540,y:607.5),endRadius:1350,options:[.drawsBeforeStartLocation,.drawsAfterEndLocation])
            var random:UInt32=51
            for _ in 0..<90 {
                random=random &* 1664525 &+ 1013904223
                let x=CGFloat(random%1080);random=random &* 1664525 &+ 1013904223
                let y=CGFloat(random%1350),r=CGFloat(random%22)/10
                g.setFillColor(UIColor(hex:0xcfe4ff).withAlphaComponent(0.5).cgColor);g.fillEllipse(in:CGRect(x:x,y:y,width:r*2,height:r*2))
            }
            func text(_ value:String,_ baseline:CGFloat,_ size:CGFloat,_ fontName:String="ChakraPetch-Bold",_ color:UIColor=UIColor(hex:0xe9f1ff),_ align:NSTextAlignment = .center,_ x:CGFloat=0,_ width:CGFloat=1080) {
                let style=NSMutableParagraphStyle();style.alignment=align
                let font=UIFont(name:fontName,size:size) ?? .systemFont(ofSize:size)
                (value as NSString).draw(in:CGRect(x:x,y:baseline-font.ascender,width:width,height:size*1.5),withAttributes:[.font:font,.foregroundColor:color,.paragraphStyle:style])
            }
            let cyan=UIColor(hex:0x5ce1ff),muted=UIColor(hex:0x5c6a8a)
            text("SLOUCH",190,120,"ZenDots-Regular",cyan)
            text(duel ? "DUEL CHALLENGE":report["mode"].string=="daily" ? "DAILY CHALLENGE":"FLIGHT REPORT",250,34,"ChakraPetch-SemiBold",muted)
            text(report["score"].int.formatted(),470,150,"ZenDots-Regular",.white)
            let mode=["techneck":"TECH NECK","casual":"CASUAL","daily":"DAILY","duel":"DUEL","weekly":"WEEKLY"][report["mode"].string] ?? "FLIGHT"
            text(tag+" · "+mode,540,40)
            g.setLineWidth(26);g.setLineCap(.round);g.setStrokeColor(UIColor(hex:0x7a84ad).withAlphaComponent(0.25).cgColor)
            g.strokeEllipse(in:CGRect(x:390,y:650,width:300,height:300))
            g.setStrokeColor(cyan.cgColor);g.addArc(center:CGPoint(x:540,y:800),radius:150,startAngle:-.pi/2,endAngle:-.pi/2+CGFloat(report["stretchScore"].number/100)*2 * .pi,clockwise:false);g.strokePath()
            text(String(report["stretchScore"].int),820,84,"ZenDots-Regular",.white)
            text("STRETCH SCORE",870,30,"ChakraPetch-Bold",muted)
            let r=report["rom"]
            let rows=report["touch"].bool ? [("MODE","TOUCH"),("TIME","\(report["duration"].int)s")]:[
                ("↔ ROTATION","\(r["yawL"].int)° / \(r["yawR"].int)°"),
                ("↕ FLEX / EXT","\(r["pitchD"].int)° / \(r["pitchU"].int)°"),
                ("⤿ SIDE BEND","\(r["rollL"].int)° / \(r["rollR"].int)°"),
                ("CHIN TUCKS",String(report["tucks"].int)),
                ("STRETCH GATES",String(report["gates"].int))]
            for (i,row) in rows.enumerated() {
                let y=CGFloat(1030+i*56)
                text(row.0,y,34,"ChakraPetch-Bold",muted,.left,140,800)
                text(row.1,y,34,"ChakraPetch-Bold",UIColor(hex:0xe8ecff),.right,140,800)
            }
            text(duel ? "Beat my score → slouch. fix your neck.":"fix your neck · save the galaxy",1300,30,"ChakraPetch-Bold",cyan)
        }
    }
}
