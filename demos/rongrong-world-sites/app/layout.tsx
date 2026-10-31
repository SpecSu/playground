import type {Metadata} from "next";
import "../src/style.css";
export const metadata:Metadata={title:"绒绒世界",description:"照料小伙伴、布置风景、拜访好友，在绒绒世界里一起生活。"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body><script src="/boot-guard.js" async/>{children}</body></html>;}
