import SwiftUI

let slouchInk=Color(uiColor:UIColor(hex:0xe9f1ff))
let slouchMuted=Color(uiColor:UIColor(hex:0x5c6a8a))
let slouchHot=Color(uiColor:UIColor(hex:0xff4d6d))
let slouchBackground=Color(uiColor:UIColor(hex:0x05070e))

struct SlouchButton:View {
    let title:String
    var primary=false
    var accent=Color.cyan
    var action:()->Void
    var body:some View {
        Button(action:action) {
            Text(title).font(.custom("ChakraPetch-SemiBold",size:primary ? 15:13)).tracking(3.4)
                .foregroundStyle(primary ? slouchBackground:slouchInk)
                .frame(maxWidth:.infinity).padding(.vertical,primary ? 16:13)
                .background(primary ? accent:Color.clear,in:Capsule())
                .shadow(color:primary ? accent.opacity(0.35):.clear,radius:15)
                .contentShape(Capsule())
        }.buttonStyle(.plain).frame(maxWidth:300)
    }
}
struct SlouchLabel:View {
    let text:String
    var color=Color.cyan
    var body:some View {Text(text).font(.custom("ChakraPetch-Bold",size:12)).tracking(4).foregroundStyle(color).multilineTextAlignment(.center)}
}
struct ThinBar:View {
    let progress:Double
    var color=Color.cyan
    var height:CGFloat=3
    var body:some View {
        GeometryReader{g in ZStack(alignment:.leading){
            color.opacity(0.16)
            color.frame(width:max(0,min(1,progress))*g.size.width)
        }}.frame(height:height)
    }
}
struct GoalRings:View {
    let goals:JSONValue
    var accent=Color.cyan
    var body:some View {
        ZStack {
            ring(goals["moveSec"].number/90,size:34,color:accent)
            ring(goals["tucks"].number/10,size:24,color:slouchInk)
            ring(goals["stretches"].number/6,size:14,color:slouchHot)
        }.frame(width:40,height:40)
    }
    private func ring(_ progress:Double,size:CGFloat,color:Color)->some View {
        ZStack {Circle().stroke(color.opacity(0.15),lineWidth:3.4)
            Circle().trim(from:0,to:max(0,min(1,progress))).stroke(color,style:StrokeStyle(lineWidth:3.4,lineCap:.round)).rotationEffect(.degrees(-90))
        }.frame(width:size,height:size)
    }
}
struct MenuIcon:View {
    let title:String,symbol:String
    var action:()->Void
    var body:some View {
        Button(action:action){VStack(spacing:5){GameIcon(name:symbol);Text(title).font(.custom("ChakraPetch-Bold",size:9)).tracking(2)}.padding(.vertical,10).padding(.horizontal,12)}
            .buttonStyle(.plain).foregroundStyle(slouchMuted).accessibilityLabel(title)
    }
}

struct GameIcon: View {
    let name:String
    private var original:String { ["sparkle":"i-star","chart.bar":"i-chart","trophy":"i-trophy","gearshape":"i-gear","pause":"i-pause","chevron.left":"i-back","lock":"i-lock","square.and.arrow.up":"i-share","flame":"i-flame"][name] ?? name }
    var body:some View {
        if let url=Bundle.main.resourceURL?.appendingPathComponent("GameResources/Icons/"+original+".png"),
           let image=UIImage(contentsOfFile:url.path) {
            Image(uiImage:image).renderingMode(.template).resizable().frame(width:20,height:20)
        }
    }
}
