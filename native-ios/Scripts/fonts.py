import pathlib, urllib.request, urllib.parse
out=pathlib.Path(__file__).resolve().parents[1]/'Slouch/GameResources/Fonts';out.mkdir(parents=True,exist_ok=True)
fonts={'zendots':['ZenDots-Regular.ttf'],'chakrapetch':['ChakraPetch-Regular.ttf','ChakraPetch-SemiBold.ttf','ChakraPetch-Bold.ttf'],'baloo2':['Baloo2[wght].ttf'],'fredoka':['Fredoka[wdth,wght].ttf']}
for family,files in fonts.items():
 for f in files+['OFL.txt']:
  url='https://raw.githubusercontent.com/google/fonts/main/ofl/'+family+'/'+urllib.parse.quote(f)
  name=(family+'-OFL.txt') if f=='OFL.txt' else f.split('[')[0]+'.ttf' if '[' in f else f
  urllib.request.urlretrieve(url,out/name)
  if f=='OFL.txt':
   p=out/name;p.write_text('\n'.join(line.rstrip() for line in p.read_text().splitlines())+'\n')
print('Original font families and OFL licenses downloaded.')
