import {useEffect,useRef,useState} from 'react';

type Props={content:string;finished:boolean;onFinished:()=>void;onGrow:()=>void};
export function ProgressiveReply({content,finished,onFinished,onGrow}:Props) {
  const [visible,setVisible]=useState('');
  const current=useRef('');
  useEffect(()=>{
    let frame=0,previous=performance.now();
    if(!content.startsWith(current.current)){current.current='';setVisible('');}
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick=(now:number)=>{
      const count=reduced?content.length:Math.max(1,Math.floor((now-previous)*0.15));
      if(now-previous>=16 || reduced){
        current.current=Array.from(content).slice(0,Array.from(current.current).length+count).join('');
        setVisible(current.current);previous=now;onGrow();
      }
      if(current.current!==content)frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[content,onGrow]);
  useEffect(()=>{if(finished&&visible===content)onFinished();},[finished,visible,content,onFinished]);
  return visible?<p className="agent-reply-reveal">{visible}</p>:<div className="agent-thinking" role="status" aria-label="Preparando resposta"><i/><i/><i/></div>;
}
