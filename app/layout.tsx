import type {Metadata} from "next";
import "./globals.css";
export const metadata:Metadata={title:"InterviewOS — Your interview workspace",description:"Practice interviews, build your story library and improve every answer.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
