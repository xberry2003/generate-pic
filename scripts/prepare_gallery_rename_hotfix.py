"""Preserve the deployed gallery bundle while applying the rename fix.

The server has gallery UI changes not represented by the local Vite build.
Require exact single matches, retain all other deployed JS/CSS, and publish
the result under a new content hash. Source API/error handling is also fixed.
"""

import argparse
import hashlib
import re
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("baseline", type=Path, help="Directory with index.html and live-gallery.js")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = (args.baseline / "live-gallery.js").read_text(encoding="utf-8")
    replacements = [
        ('RH=async(e,t)=>(await il.patch(`/images/${e}/name`,{name:t})).data',
         'RH=async(e,t,n="")=>(await il.patch(`/images/${e}/name`,{name:t,cosKey:n})).data'),
        ('await RH(E.id,B)', 'await RH(E.id,B,E.cosKey||"")'),
        ('$r.error(((X=(U=W==null?void 0:W.response)==null?void 0:U.data)==null?void 0:X.detail)||W.message||"修改名称失败")',
         'console.error("修改图片名称失败:",W),$r.error(__galleryRenameError(W,"修改名称失败"))'),
    ]
    for old, new in replacements:
        if source.count(old) != 1:
            raise RuntimeError("Gallery baseline changed; review before preparing this hotfix")
        source = source.replace(old, new)
    root = Path(__file__).resolve().parents[1]
    helper = (root / "standalone-gallery/src/apiErrors.js").read_text(encoding="utf-8")
    source = helper.replace("export const getApiErrorMessage", "const __galleryRenameError") + ";\n" + source
    name = "index-renamefix-" + hashlib.sha256(source.encode()).hexdigest()[:10] + ".js"
    (args.output / "assets").mkdir(parents=True, exist_ok=True)
    (args.output / "assets" / name).write_text(source, encoding="utf-8")
    html = (args.baseline / "index.html").read_text(encoding="utf-8")
    html, count = re.subn(r'(/gallery/assets/)[^\"]+\.js', lambda m: m[1] + name, html)
    if count != 1:
        raise RuntimeError("Expected one gallery entry script")
    (args.output / "index.html").write_text(html, encoding="utf-8")
    print(name)


if __name__ == "__main__":
    main()
