// Results are constructor-season totals: the source does not identify chassis variants.
const constructorIds = {midland:'mf1',redbull:'red_bull',tororosso:'toro_rosso',bmwsauber:'bmw_sauber',superaguri:'super_aguri',forceindia:'force_india',rpforceindia:'force_india',racingpoint:'racing_point',alfaromeo:'alfa',astonmartin:'aston_martin',lotusracing:'lotus_racing',teamlotus:'lotus',lotus:'lotus_f1',manormarussia:'marussia',manor:'manor',racingbulls:'rb'};
export function resultSummary(races, constructorId) {
  const drivers = new Map();
  let wins=0,podiums=0,starts=0;
  for(const race of races){
    const results=race.Results.filter(r=>r.Constructor.constructorId===constructorId);
    if(results.length)starts++;
    for(const r of results){
      const name=`${r.Driver.givenName} ${r.Driver.familyName}`;
      const driver=drivers.get(name)||{name,wins:0};
      if(Number(r.position)===1){wins++;driver.wins++;}
      if(Number(r.position)<=3)podiums++;
      drivers.set(name,driver);
    }
  }
  return {drivers:[...drivers.values()],wins,podiums,starts};
}
const seasons=new Map();
export async function loadCarResults(car){
  const key=car.id.split('-')[1],constructorId=constructorIds[key]||key;
  if(!seasons.has(car.year)){
    const races=[];
    let offset=0,total=1;
    while(offset<total){
      const response=await fetch(`https://api.jolpi.ca/ergast/f1/${car.year}/results/?limit=100&offset=${offset}`,{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Results unavailable');
      const data=(await response.json()).MRData;
      if(!data||!Array.isArray(data.RaceTable?.Races)||!Number.isFinite(Number(data.total)))throw new Error('Invalid results');
      for(const race of data.RaceTable.Races){
        const previous=races.find(r=>r.round===race.round);
        if(previous)previous.Results.push(...race.Results);else races.push(race);
      }
      total=Number(data.total);offset+=100;
      if(total>2000)throw new Error('Unexpected results size');
    }
    seasons.set(car.year,races);
  }
  const races=seasons.get(car.year);
  return {...resultSummary(races,constructorId),lastRace:races.at(-1)?.raceName};
}
