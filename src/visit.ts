/** A tour clock starts at arrival, never while the camera is travelling. */
export class GuidedTour {
  index=0;
  running=false;
  arrived=false;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private deadline=0;
  private remaining:number;
  private held=false;
  private revision=0;
  constructor(private advance:()=>void,private dwell=12000){this.remaining=dwell;}
  private clear():void{clearTimeout(this.timer);this.timer=undefined;this.revision++;}
  private schedule():void{
    this.clear();
    if(!this.running||!this.arrived||this.held)return;
    this.deadline=performance.now()+this.remaining;
    const revision=this.revision;
    this.timer=setTimeout(()=>{if(revision!==this.revision||!this.running||this.held)return;this.timer=undefined;this.advance();},this.remaining);
  }
  select(index:number):void{this.clear();this.index=index;this.arrived=false;this.remaining=this.dwell;}
  start():void{this.running=true;this.schedule();}
  arrive():void{this.arrived=true;this.schedule();}
  pause():void{
    if(this.timer!==undefined)this.remaining=Math.max(0,this.deadline-performance.now());
    this.running=false;this.clear();
  }
  stop():void{this.pause();this.held=false;this.arrived=false;this.remaining=this.dwell;}
  hold():void{
    if(this.timer!==undefined)this.remaining=Math.max(0,this.deadline-performance.now());
    this.held=true;this.clear();
  }
  release(afterAudio=false):void{this.held=false;if(afterAudio)this.remaining=2000;this.schedule();}
}

export type NarrationState='idle'|'loading'|'playing';

/** One recording at a time. Late media events cannot revive cancelled playback. */
export class RecordedNarration {
  state:NarrationState='idle';
  private media?:HTMLAudioElement;
  private revision=0;
  constructor(private changed:(state:NarrationState)=>void,private ended:()=>void,
    private failed:()=>void,private create:()=>HTMLAudioElement=()=>new Audio()){}
  get busy():boolean{return this.state!=='idle';}
  private update(state:NarrationState):void{this.state=state;this.changed(state);}
  stop():void{
    this.revision++;
    const media=this.media;this.media=undefined;
    if(media){media.onended=null;media.onerror=null;media.onplaying=null;media.onpause=null;
      media.pause();media.removeAttribute('src');media.load();}
    this.update('idle');
  }
  async play(url:string):Promise<void>{
    this.stop();const revision=this.revision;
    const media=this.create();this.media=media;media.preload='none';media.src=url;
    const current=()=>this.media===media&&this.revision===revision;
    media.onended=()=>{if(!current())return;this.stop();this.ended();};
    const fail=()=>{if(!current())return;this.stop();this.failed();};
    media.onerror=fail;
    media.onplaying=()=>{if(current())this.update('playing');};
    // Native/external pause must not leave the tour waiting on stale state.
    media.onpause=()=>{if(current()&&!media.ended){this.stop();this.failed();}};
    this.update('loading');
    try{await media.play();if(current())this.update('playing');else media.pause();}
    catch{fail();}
  }
}
