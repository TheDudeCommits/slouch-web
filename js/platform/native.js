import { Capacitor, registerPlugin } from '@capacitor/core';
export const isNative = Capacitor.isNativePlatform();
export const native = registerPlugin('SlouchNative');
export async function nativeSave(value) { if (isNative) await native.save({ value }); }
export async function nativeLoad() { return isNative ? (await native.load()).value : null; }
export async function reminder(enabled) { if (isNative) return native.reminder({ enabled }); return { granted: false }; }
export async function haptic() { if (isNative) await native.haptic().catch(() => {}); }
export async function shareNativeFile(blob,name) {
  const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
  return (await native.shareFile({base64,name})).completed;
}
