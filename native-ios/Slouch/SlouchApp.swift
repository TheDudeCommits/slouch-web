import SwiftUI

@main struct SlouchApp: App {
    @State private var model=SlouchModel()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            SlouchRootView(model:model)
                .task{await model.boot()}
                .onOpenURL{model.acceptURL($0)}
                .onChange(of:phase){_,value in if value == .active {model.foreground()}else {model.background()}}
        }
    }
}
