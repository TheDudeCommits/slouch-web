import pathlib,re,subprocess,json
root=pathlib.Path(__file__).resolve().parents[2]
out=root/'native-ios/Slouch/GameResources/Icons';out.mkdir(parents=True,exist_ok=True)
for name,content in re.findall(r'<symbol id="([^"]+)"[^>]*>(.*?)</symbol>',(root/'index.html').read_text(),re.S):
    svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+content+'</svg>'
    subprocess.run(['rsvg-convert','-w','72','-h','72','-o',str(out/(name+'.png'))],input=svg.encode(),check=True)
catalog=root/'native-ios/Slouch/AppAssets.xcassets'
icon=catalog/'AppIcon.appiconset';icon.mkdir(parents=True,exist_ok=True)
svg=(root/'icons/icon.svg').read_text().replace('</defs>','</defs><rect width="180" height="180" fill="#05060f"/>')
subprocess.run(['rsvg-convert','-w','1024','-h','1024','-o',str(icon/'AppIcon.png')],input=svg.encode(),check=True)
(icon/'Contents.json').write_text(json.dumps({'images':[{'filename':'AppIcon.png','idiom':'universal','platform':'ios','size':'1024x1024'}],'info':{'author':'xcode','version':1}},indent=2))
(catalog/'Contents.json').write_text(json.dumps({'info':{'author':'xcode','version':1}},indent=2))
print('Original SVG icons converted for the native asset bundle.')
