import Capacitor
import UIKit

final class SlouchViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SlouchNativePlugin())
        webView?.isOpaque = false
        webView?.backgroundColor = UIColor(red: 0.97, green: 0.96, blue: 0.93, alpha: 1)
        webView?.scrollView.bounces = false
    }
    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }
}
