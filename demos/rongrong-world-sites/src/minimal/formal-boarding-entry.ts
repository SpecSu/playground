/** Local named demos are not signed-in accounts. Only the two hostnames supported
 * by the loopback server leave this origin; no caller-provided URL/query is used. */
export function formalBoardingEntry(hostname?:string):{href:string;local:boolean}{
 const local=hostname==='127.0.0.1'||hostname==='localhost';
 return {href:local?'https://fluffy-farm-companions.tangguozhou.chatgpt.site/':'/',local};
}
