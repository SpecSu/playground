export async function POST(request:Request){const value=await request.text();console.error("Farm browser runtime",value.slice(0,1100));return Response.json({ok:true});}
