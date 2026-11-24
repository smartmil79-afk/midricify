'use client';
import {usePathname} from 'next/navigation';
import {AppSidebar} from './AppSidebar';
export function WorkspaceShell({children}:{children:React.ReactNode}){const path=usePathname();const isDashboard=path==='/';return <><AppSidebar/><div className={isDashboard?'min-h-screen':'md:ml-64 min-h-screen pt-14 md:pt-0'}>{children}</div></>}
