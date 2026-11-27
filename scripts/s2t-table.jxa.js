ObjC.import('Foundation');
function run() {
  let out = [];
  for (let cp = 0x4E00; cp <= 0x9FA5; cp++) {
    const ch = String.fromCodePoint(cp);
    const t = ObjC.unwrap($.NSString.alloc.initWithString(ch).stringByApplyingTransformReverse('Hans-Hant', false));
    if (t && t !== ch && t.length === 1) out.push(ch + t);
  }
  return out.join('');
}
