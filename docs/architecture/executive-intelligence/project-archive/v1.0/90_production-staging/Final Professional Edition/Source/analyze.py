# -*- coding: utf-8 -*-
"""Accurate widow/orphan/heading analysis over paginated pages (post-hoc)."""
from collections import defaultdict

def analyze_pages(pages):
    st=dict(widows=0, orphans=0, heading_bottom=0, heading_short_follow=0,
            split_blocks=0, near_empty_tail=0, body_lines=0)
    # map blk -> list of (page_index, item)
    blk_pages=defaultdict(list)
    for pi,pg in enumerate(pages):
        for it in pg:
            if it.get("text","").strip():
                st["body_lines"]+=1
            blk_pages[it["blk"]].append((pi,it))
    # per-page last content item (for heading-at-bottom + near-empty tail)
    for bi, items in blk_pages.items():
        kind=items[0][1]["kind"]
        pset=sorted(set(pi for pi,_ in items))
        total=len(items)
        first_pi=pset[0]; last_pi=pset[-1]
        lines_first=sum(1 for pi,_ in items if pi==first_pi)
        lines_last=sum(1 for pi,_ in items if pi==last_pi)
        if kind in ("para","bullet") and total>=2:
            # orphan: first line alone at bottom of first page (block continues on next)
            if len(pset)>1 and lines_first==1:
                st["orphans"]+=1
            # widow: single last line alone on a later page
            if len(pset)>1 and lines_last==1:
                st["widows"]+=1
            if len(pset)>1:
                st["split_blocks"]+=1
    # heading at bottom: heading is the last item on its page
    for pi,pg in enumerate(pages):
        if not pg: continue
        last=pg[-1]
        if last["kind"]=="heading":
            st["heading_bottom"]+=1
    # near-empty tail: last page has < 3 content items
    if pages:
        tail=[it for it in pages[-1] if it.get("text","").strip()]
        if len(tail)<3: st["near_empty_tail"]=1
    return st

def merge(a,b):
    for k,v in b.items(): a[k]=a.get(k,0)+v
    return a
