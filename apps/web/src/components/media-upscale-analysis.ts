export function analyseUpscaleImage(image: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', {willReadFrequently:true})!;
  // Measure high-frequency fluctuations in relatively even regions at original resolution.
  const size = Math.min(128,image.naturalWidth,image.naturalHeight);
  canvas.width = canvas.height = size;
  const residuals: number[] = [];
  for (const fraction of [0.25,0.5,0.75]) {
    context.drawImage(image,Math.round((image.naturalWidth-size)*fraction),Math.round((image.naturalHeight-size)*fraction),size,size,0,0,size,size);
    const pixels=context.getImageData(0,0,size,size).data;
    for(let y=1;y<size-1;y+=2) for(let x=1;x<size-1;x+=2){
      const i=(y*size+x)*4;
      const neighbours=[i-4,i+4,i-size*4,i+size*4];
      if([i,...neighbours].some(j=>pixels[j+3]!<240)) continue;
      const values=neighbours.map(j=>pixels[j+1]!);
      if(Math.max(...values)-Math.min(...values)>18) continue;
      residuals.push(Math.abs(pixels[i+1]!-values.reduce((sum,n)=>sum+n,0)/4));
    }
  }
  residuals.sort((a,b)=>a-b);
  const median=residuals[Math.floor(residuals.length/2)]??0;
  return {noise:median>=7?2:median>=3?1:-1};
}
