/** Local-device daily totals. No accounts, backend, or migration of historical bests. */
export const DAILY_SCORE_KEY = 'encore-daily-score-v1';
// Fixed demo friends, not real player activity or network ranking data.
const DEMO_FRIENDS = [
  {name:'MOMO',score:88500,self:false},
  {name:'小满',score:72650,self:false},
  {name:'Yuki',score:51350,self:false},
];
const validScore = value => Number.isSafeInteger(value) && value >= 0;
const localDay = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}

export function createDailyScores({storage=browserStorage(),now=()=>new Date()}={}) {
  let day=localDay(now()),total=0;
  // RhythmGame creates a fresh state per run. Weak references prevent duplicate
  // result callbacks/reopens without accumulating a permanent list of run IDs.
  const counted=new WeakSet();
  try {
    const saved=JSON.parse(storage?.getItem(DAILY_SCORE_KEY)??'null');
    if(saved?.day===day && validScore(saved.total))total=saved.total;
  }catch{/* Private mode, corrupt storage, or quota errors must not stop play. */}
  function save(){try{storage?.setItem(DAILY_SCORE_KEY,JSON.stringify({day,total}));}catch{}}
  function rollDay(){const current=localDay(now());if(current!==day){day=current;total=0;save();}}
  return {
    recordCompleted(state){
      rollDay();
      if(!state || state.status!=='ended' || !validScore(state.score) || counted.has(state))return false;
      counted.add(state);
      total=Math.min(Number.MAX_SAFE_INTEGER,total+state.score);
      save();return true;
    },
    getRows(){
      rollDay();
      return [...DEMO_FRIENDS.map(row=>({...row})),{name:'你',score:total,self:true}].sort((a,b)=>b.score-a.score);
    },
  };
}
