import React from 'react';
export default function Link({href,children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>){return <a href={href} {...props}>{children}</a>;}
export function useRouter(){return {refresh:()=>{},push:()=>{},replace:()=>{}};}
