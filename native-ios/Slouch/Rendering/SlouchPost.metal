#include <metal_stdlib>
using namespace metal;
float slouchHash(float2 p) {return fract(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
// Original world.js postprocessing equations, translated to Metal.
kernel void slouchBloomThreshold(texture2d<float,access::sample> source [[texture(0)]],texture2d<float,access::write> target [[texture(1)]],uint2 gid [[thread_position_in_grid]]) {
 if(gid.x>=target.get_width()||gid.y>=target.get_height())return;
 constexpr sampler smp(coord::normalized,address::clamp_to_edge,filter::linear);
 float3 color=source.sample(smp,(float2(gid)+0.5)/float2(target.get_width(),target.get_height())).rgb;
 float luminosity=dot(color,float3(0.299,0.587,0.114));
 target.write(float4(color*smoothstep(0.78,0.79,luminosity),1),gid);
}
kernel void slouchPost(texture2d<float,access::sample> source [[texture(0)]],texture2d<float,access::write> target [[texture(1)]],texture2d<float,access::sample> depth [[texture(2)]],array<texture2d<float,access::sample>,5> bloom [[texture(3)]],constant float4 &params [[buffer(0)]],constant float4 &fog [[buffer(1)]],constant float4x4 &inverseProjection [[buffer(2)]],constant float4 &tint [[buffer(3)]],uint2 gid [[thread_position_in_grid]]) {
 if(gid.x>=target.get_width()||gid.y>=target.get_height())return;
 constexpr sampler smp(coord::normalized,address::clamp_to_edge,filter::linear);
 float2 size=float2(target.get_width(),target.get_height()),uv=(float2(gid)+0.5)/size,c=uv-0.5;
 float r2=dot(c,c),hyper=params.y,time=params.x,ca=0.0016+hyper*0.008;
 float2 off=c*r2*ca*14.0;
 float3 col=float3(source.sample(smp,uv+off).r,source.sample(smp,uv).g,source.sample(smp,uv-off).b);
 // RealityKit supplies tone-mapped color here; retain highlight detail when
 // compositing the original bloom weights into that bounded color range.
 float3 halo=0;for(uint i=0;i<5;i++)halo+=bloom[i].sample(smp,uv).rgb*(0.52+float(i)*0.04)*0.65;
 col+=halo*(1-clamp(col,0.0,1.0));
 float z=depth.sample(smp,uv).r;
 float4 position=inverseProjection*float4(uv.x*2-1,1-uv.y*2,z,1);
 float distance=abs(position.z/position.w);
 if(z>0.00001 && distance<600) col=mix(col,fog.rgb,1-exp(-params.z*params.z*distance*distance));
 if(hyper>0.01){float2 d=float2(c.x*size.x/size.y,c.y);float streak=slouchHash(float2(floor(atan2(d.y,d.x)*60.0),floor(time*24.0)));float mask=smoothstep(0.06,0.42,r2)*step(0.82,streak)*hyper;col+=tint.rgb*mask*0.5;}
 col*=1-r2*(0.28-hyper*0.1);
 col+=(slouchHash(uv*float2(1917,1033)+fract(time))-0.5)*0.035;
 // A linear texture view bypasses hardware sRGB encoding, so preserve it here.
 if(params.w>0.5){col=max(col,0.0);col=select(1.055*pow(col,float3(1.0/2.4))-0.055,12.92*col,col<=0.0031308);}
 target.write(float4(col,1),gid);
}
