import type {Metadata} from "next";import "./globals.css";import "./enhancements.css";
export const metadata:Metadata={title:"加速器每日巡檢系統",description:"多人加速器開關機數位巡檢、異常紀錄與列印歸檔。"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-Hant"><body>{children}</body></html>}
