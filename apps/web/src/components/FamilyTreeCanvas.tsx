import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon } from '@phosphor-icons/react/Plus';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { copy, interpolate } from '@/copy';
import {
  personNodeLabel,
  type FamilyPerson,
  type FamilyRelationship,
  type RelationshipKind,
} from '@/lib/family-graph';
import { TREE_NODE_WIDTH, layoutFamilyTree, livingLabelVisible } from '@/lib/family-tree';
import { formatNodeYears } from '@/lib/person-years';

type FamilyTreeCanvasProps = {
  people: FamilyPerson[];
  relationships: FamilyRelationship[];
  accountId?: string;
  resetToken: number;
};

function PersonAvatar({ person }: { person: FamilyPerson }) {
  if (person.avatar_url) {
    return <img src={person.avatar_url} alt="" className="size-14 rounded-full object-cover" />;
  }
  const initial = personNodeLabel(person).slice(0, 1);
  return (
    <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-h3 font-semibold text-secondary-foreground">
      {initial}
    </div>
  );
}

export function FamilyTreeCanvas({
  people,
  relationships,
  accountId,
  resetToken,
}: FamilyTreeCanvasProps) {
  const navigate = useNavigate();
  const viewportRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(
    () => layoutFamilyTree(people, relationships, accountId),
    [people, relationships, accountId]
  );
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null);

  useEffect(() => {
    const me = layout.nodes.find((node) => node.isMe) ?? layout.nodes[0];
    const viewport = viewportRef.current;
    if (!me || !viewport) {
      setView({ x: 0, y: 0, scale: 1 });
      return;
    }
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    setView({
      x: width / 2 - (me.x + TREE_NODE_WIDTH / 2),
      y: Math.max(24, height / 3 - me.y),
      scale: 1,
    });
    setMenuFor(null);
  }, [layout, resetToken]);

  function goAdd(kind: RelationshipKind, personId: string) {
    setMenuFor(null);
    navigate(`/family/people/new?kind=${kind}&person=${personId}`);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: view.scale,
      };
      drag.current = null;
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const next = Math.min(2.4, Math.max(0.55, pinch.current.scale * (distance / pinch.current.distance)));
      setView((current) => ({ ...current, scale: next }));
      return;
    }
    if (drag.current && pointers.current.size === 1) {
      setView({
        x: drag.current.viewX + event.clientX - drag.current.x,
        y: drag.current.viewY + event.clientY - drag.current.y,
        scale: view.scale,
      });
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.92 : 1.08;
    setView((current) => ({
      ...current,
      scale: Math.min(2.4, Math.max(0.55, current.scale * delta)),
    }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={viewportRef}
        className="relative h-[min(68vh,560px)] touch-none overflow-hidden rounded-xl bg-card"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
          >
            {layout.couples.map((couple) => (
              <line
                key={`${couple.a}-${couple.b}`}
                x1={couple.x1}
                y1={couple.y}
                x2={couple.x2}
                y2={couple.y}
                stroke="currentColor"
                className="text-input"
                strokeWidth="2"
              />
            ))}
            {layout.brackets.map((bracket, index) => {
              const parentY = bracket.y + 8;
              const midY = bracket.y + 28;
              const childY = bracket.y + TREE_GAP_CHILD;
              const minX = Math.min(...bracket.parentXs, ...bracket.childXs);
              const maxX = Math.max(...bracket.parentXs, ...bracket.childXs);
              return (
                <g key={`bracket-${index}`}>
                  {bracket.parentXs.map((x) => (
                    <line key={`p-${x}`} x1={x} y1={parentY} x2={x} y2={midY} stroke="currentColor" className="text-input" strokeWidth="2" />
                  ))}
                  <line x1={minX} y1={midY} x2={maxX} y2={midY} stroke="currentColor" className="text-input" strokeWidth="2" />
                  {bracket.childXs.map((x) => (
                    <line key={`c-${x}`} x1={x} y1={midY} x2={x} y2={childY} stroke="currentColor" className="text-input" strokeWidth="2" />
                  ))}
                </g>
              );
            })}
          </svg>

          {layout.nodes.map((node) => {
            const years = formatNodeYears(node.person);
            const open = menuFor === node.id;
            return (
              <div
                key={node.id}
                className="absolute flex w-[88px] flex-col items-center"
                style={{ left: node.x, top: node.y }}
              >
                <button
                  type="button"
                  className={`flex w-full flex-col items-center gap-1 rounded-xl bg-card px-1 py-2 ${
                    node.isMe ? 'ring-2 ring-primary' : ''
                  }`}
                  aria-label={personNodeLabel(node.person)}
                  onClick={() => navigate(`/family/people/${node.id}`)}
                >
                  <PersonAvatar person={node.person} />
                  <span className="line-clamp-2 text-center text-caption font-medium">
                    {personNodeLabel(node.person)}
                  </span>
                  {years ? <span className="text-overline text-muted-foreground">{years}</span> : null}
                  {livingLabelVisible(node.person) ? (
                    <span className="text-center text-overline text-muted-foreground">
                      {interpolate(copy['person.death.age'], { อายุ: String(node.person.age) })}
                    </span>
                  ) : null}
                </button>
                <div className="relative">
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="size-8 min-h-8 min-w-8"
                    aria-label={interpolate(copy['tree.node.add'], { ชื่อ: personNodeLabel(node.person) })}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuFor(open ? null : node.id);
                    }}
                  >
                    <Icon as={PlusIcon} size={16} />
                  </Button>
                  {open ? (
                    <div className="absolute left-1/2 z-10 mt-1 w-36 -translate-x-1/2 rounded-xl border border-border bg-card p-1 shadow-e2">
                      <button type="button" className="flex min-h-11 w-full items-center px-3 text-left text-body" onClick={() => goAdd('parent_of', node.id)}>
                        {copy['tree.node.add_parent']}
                      </button>
                      <button type="button" className="flex min-h-11 w-full items-center px-3 text-left text-body" onClick={() => goAdd('child_of', node.id)}>
                        {copy['tree.node.add_child']}
                      </button>
                      <button type="button" className="flex min-h-11 w-full items-center px-3 text-left text-body" onClick={() => goAdd('spouse_of', node.id)}>
                        {copy['tree.node.add_spouse']}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {layout.unrelated.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-h3 font-semibold">{copy['tree.unrelated.title']}</h3>
          <p className="text-caption text-muted-foreground">{copy['tree.unrelated.body']}</p>
          <ul className="flex flex-wrap gap-3">
            {layout.unrelated.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  className="flex w-20 flex-col items-center gap-1"
                  onClick={() => navigate(`/family/people/${person.id}`)}
                >
                  <PersonAvatar person={person} />
                  <span className="line-clamp-2 text-center text-caption">{personNodeLabel(person)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const TREE_GAP_CHILD = 48;
