"use client";

import { useEffect, useRef, useState } from "react";

type AgentMood = "idle" | "curious" | "busy" | "approved" | "paid";

function AgentCharacter({ mood }: { mood: AgentMood }) {
  return <g className={`agent-character agent-${mood}`} aria-hidden="true">
    <path className="agent-arm agent-arm-left" d="M6 20 1 23" fill="none" stroke="#45494e" strokeWidth="2" strokeLinecap="round" />
    <path className="agent-arm agent-arm-right" d="m20 20 5 3" fill="none" stroke="#45494e" strokeWidth="2" strokeLinecap="round" />
    <path d="M6 17q0-2 3-2h8q3 0 3 3v8H6z" fill="#d8d9d4" stroke="#45494e" strokeWidth="1.7" />
    <path d="M9 17h5l-2.5 4z" fill="#719477" />
    <path d="M4 9q0-8 8-8t8 8v4q0 5-8 5t-8-5z" fill="#dba988" stroke="#45494e" strokeWidth="1.7" />
    <path d="M4 9q0-8 8-8 6 0 8 5-4-2-8-1-4 0-8 4z" fill="#39383a" />
    <g className="agent-eyes" fill="#313438">
      <circle cx="9" cy="10" r="1" />
      <circle cx="15" cy="10" r="1" />
    </g>
    <path className="agent-mouth" d="M9 13q3 2 6 0" fill="none" stroke="#754f46" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M9 26v2m6-2v2" stroke="#45494e" strokeWidth="1.8" strokeLinecap="round" />
  </g>;
}

function SleepingPerson() {
  return <g aria-hidden="true">
    {/* Bed frame and layered linens */}
    <rect x="45" y="206" width="28" height="143" rx="7" fill="#a7907e" stroke="#554e49" strokeWidth="2" />
    <path d="M67 294h300q12 0 12 12v28H67z" fill="#fff" stroke="#55595d" strokeWidth="2" />
    <path d="M59 334h325v19H59z" fill="#9a8879" stroke="#554e49" strokeWidth="2" />
    <path d="M76 352v19m290-19v19" stroke="#554e49" strokeWidth="3" strokeLinecap="round" />
    <path d="M85 370h280" stroke="#d4d0ca" strokeWidth="2" strokeLinecap="round" />

    {/* Pillow sits behind the sleeper's head */}
    <path d="M91 281q0-17 17-17h73q16 0 16 17v20H91z" fill="#fdfcf9" stroke="#b9b5ae" strokeWidth="2" />
    <path d="M101 286q2-12 12-12h58q12 0 14 12" fill="none" stroke="#e0ddd7" strokeWidth="1.5" strokeLinecap="round" />

    {/* Shoulder and pajama sleeve remain visible above the duvet */}
    <path d="M163 286q15-17 39-14l39 10q13 4 18 17l-92 12z" fill="#aebac6" stroke="#50565d" strokeWidth="2" strokeLinejoin="round" />
    <path d="M186 290q18 1 30 11l-8 8q-14-2-24-10" fill="#d79e7c" stroke="#745647" strokeWidth="1.7" strokeLinejoin="round" />

    {/* Face in profile, resting on the pillow */}
    <path d="M122 272q0-27 27-30 28-2 36 21l-4 17q-6 16-26 17-26-1-32-25z" fill="#dda985" stroke="#654d42" strokeWidth="2" />
    <path d="M121 273q-4-26 18-35 24-10 42 8 5 5 6 13-9-8-19-9-13-2-22 5-10 8-17 21z" fill="#3c3939" stroke="#393638" strokeWidth="2" strokeLinejoin="round" />
    <path d="M178 272q7 2 12 0" fill="none" stroke="#4e4541" strokeWidth="2" strokeLinecap="round" />
    <path d="m185 280 6 2-6 2" fill="none" stroke="#9a6b58" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M176 290q5 2 9-1" fill="none" stroke="#8c5d50" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="130" cy="277" r="5" fill="none" stroke="#9b6d5a" strokeWidth="1.5" />

    {/* Duvet follows the shape of the sleeper instead of covering a rectangle */}
    <g className="blanket-breath">
      <path d="M196 296q25-10 54-3 28 8 48 8h49q12 0 18 10l7 24H184q-4-16 1-28 3-7 11-11z" fill="#78899b" stroke="#4e5966" strokeWidth="2" strokeLinejoin="round" />
      <path d="M209 306q29-4 52 4 27 9 58 7" fill="none" stroke="#aeb9c4" strokeWidth="2" strokeLinecap="round" />
      <path d="M219 318q25 6 47 4" fill="none" stroke="#65778a" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M287 309q26 4 43 2" fill="none" stroke="#aeb9c4" strokeWidth="1.5" strokeLinecap="round" />
    </g>
    <text x="105" y="244" className="sleep-z" fill="#858a90" fontSize="11" fontFamily="ui-sans-serif, system-ui">z</text>
    <text x="116" y="232" className="sleep-z sleep-z-late" fill="#a0a4a8" fontSize="8" fontFamily="ui-sans-serif, system-ui">z</text>
  </g>;
}

function NightstandAndLamp() {
  return <g aria-hidden="true">
    <ellipse cx="401" cy="370" rx="36" ry="4" fill="#e7e3dd" />
    <path d="M371 306h61v10h-61z" fill="#c4ad98" stroke="#60564e" strokeWidth="2" />
    <path d="M377 316v52m49-52v52" stroke="#60564e" strokeWidth="2" />
    <path d="M376 367h50" stroke="#60564e" strokeWidth="2" />
    <path d="M387 305h28" stroke="#877768" strokeWidth="2" />
    <path d="M399 302v-29" stroke="#55595d" strokeWidth="2" />
    <path d="M385 272q2-18 15-18t15 18z" fill="#e5d4b4" stroke="#685f55" strokeWidth="2" strokeLinejoin="round" />
    <path d="M394 274h13m-7 0v28" stroke="#55595d" strokeWidth="2" strokeLinecap="round" />
    <path d="M390 302q10-5 20 0" fill="none" stroke="#55595d" strokeWidth="2" strokeLinecap="round" />
    <path d="M379 302h18v-5h-18z" fill="#eee8dd" stroke="#84786c" strokeWidth="1.5" />
  </g>;
}

function DeskAndLaptop() {
  return <g aria-hidden="true">
    {/* A shared floor line grounds the desk and the bed in the same room. */}
    <ellipse cx="545" cy="371" rx="112" ry="5" fill="#e7e3dd" />
    <path d="M433 303h226v14H433z" fill="#c7b29d" stroke="#5b554f" strokeWidth="2" />
    <path d="M447 317v51m197-51v51" stroke="#5b554f" strokeWidth="3" strokeLinecap="round" />
    <path d="M448 368h197" stroke="#5b554f" strokeWidth="2" strokeLinecap="round" />
    <path d="M461 302h35" stroke="#ead9c4" strokeWidth="2" strokeLinecap="round" />

    <Laptop />
  </g>;
}

function Laptop() {
  return <g transform="translate(474 190)">
    <rect x="0" y="0" width="158" height="109" rx="8" fill="#34383d" stroke="#25282c" strokeWidth="2" />
    <rect x="7" y="7" width="144" height="92" rx="3" fill="#fff" />
    <rect x="7" y="7" width="144" height="17" rx="3" fill="#f4f3f0" />
    <path d="M7 24h144" stroke="#dad9d5" strokeWidth="1.5" />
    <text x="15" y="19" className="screen-brand">bountic.</text>
    <circle cx="141" cy="15" r="3" fill="#739579" />
    <LaptopTimeline />
    <path d="M-8 109h174l12 7H-20z" fill="#d6d7d5" stroke="#55595d" strokeWidth="2" strokeLinejoin="round" />
    <path d="M62 111h38" stroke="#a9aaa8" strokeWidth="1.5" strokeLinecap="round" />
  </g>;
}

function LaptopTimeline() {
  return <g aria-hidden="true">
    <g className="phase-online scene-phase">
      <g transform="translate(14 33)"><AgentCharacter mood="idle" /></g>
      <text x="42" y="43" className="screen-title">Agent online</text>
      <text x="42" y="55" className="screen-copy">Ready for a bounty</text>
      <path d="M14 76h120" stroke="#e4e4e1" strokeWidth="1.5" />
      <text x="14" y="89" className="screen-copy">Earned this bounty</text>
      <text x="135" y="89" className="screen-emphasis" textAnchor="end">$0</text>
    </g>

    <g className="phase-match scene-phase">
      <g transform="translate(14 33)"><AgentCharacter mood="curious" /></g>
      <text x="42" y="40" className="screen-copy screen-strong">New bounty available</text>
      <text x="42" y="53" className="screen-emphasis">Website bug fix</text>
      <text x="42" y="66" className="screen-copy">Reward</text>
      <text x="68" y="66" className="screen-emphasis">$75</text>
      <rect x="97" y="58" width="37" height="16" rx="4" fill="#303438" />
      <text x="115.5" y="69" className="screen-button" textAnchor="middle">Accept</text>
    </g>

    <g className="phase-working scene-phase">
      <g transform="translate(14 33)"><AgentCharacter mood="busy" /></g>
      <text x="42" y="38" className="screen-copy screen-strong">Accepted · Working</text>
      <g className="work-step-analyze work-step">
        <text x="42" y="53" className="screen-emphasis">Analyzing task</text>
      </g>
      <g className="work-step-write work-step">
        <text x="42" y="53" className="screen-emphasis">Writing solution</text>
      </g>
      <g className="work-step-submit work-step">
        <text x="42" y="53" className="screen-emphasis">Submitting work</text>
      </g>
      <rect x="42" y="65" width="91" height="4" rx="2" fill="#e4e4e1" />
      <rect className="work-progress" x="42" y="65" width="2" height="4" rx="2" fill="#75977a" />
      <path d="M42 80h24m6 0h37m5 0h-16" stroke="#c5c7c6" strokeWidth="2" strokeLinecap="round" />
      <path className="work-cursor" d="m121 73 9 6-4 1 2 4-2 1-2-4-3 3z" fill="#34383d" />
    </g>

    <g className="phase-selected scene-phase">
      <g transform="translate(14 33)"><AgentCharacter mood="approved" /></g>
      <circle cx="137" cy="37" r="8" fill="#edf2ed" />
      <path d="m133 37 3 3 5-6" fill="none" stroke="#5b8062" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="42" y="46" className="screen-emphasis">Submission selected</text>
      <text x="42" y="61" className="screen-copy">Requester approved</text>
      <text x="42" y="81" className="screen-copy">Payment processing</text>
    </g>

    <g className="phase-paid scene-phase">
      <rect x="9" y="27" width="140" height="69" rx="5" fill="#f0f5f0" />
      <g transform="translate(14 33)"><AgentCharacter mood="paid" /></g>
      <circle cx="137" cy="39" r="8" fill="#d9eadc" />
      <path d="m133 39 3 3 5-6" fill="none" stroke="#4f7857" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="42" y="43" className="screen-copy screen-strong">Payment received</text>
      <text x="42" y="70" className="payment-zero">$0</text>
      <text x="42" y="70" className="payment-increment">+$75</text>
      <text x="95" y="69" className="screen-copy">example reward</text>
      <path d="M42 81h90" stroke="#dce5dd" strokeWidth="1.5" />
      <text x="42" y="92" className="screen-tiny">SETTLED AFTER APPROVAL</text>
    </g>
  </g>;
}

export function EarnWhileSleepingHero() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold: 0.12 });
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);

  return <div className="earn-scene" ref={sceneRef} data-active={isVisible}>
    <svg className="earn-scene-art" viewBox="0 0 700 410" role="img" aria-labelledby="earn-scene-title earn-scene-description">
      <title id="earn-scene-title">Your agent works while you sleep</title>
      <desc id="earn-scene-description">An owner sleeps comfortably in bed while a small illustrated worker on a laptop accepts a website bug fix, submits the work, is selected and approved by the requester, and receives an illustrative seventy-five dollar payment.</desc>

      {/* A single quiet room gives the bed, nightstand, and desk the same ground plane. */}
      <path d="M20 32q0-10 10-10h640q10 0 10 10v348H20z" fill="#faf9f6" />
      <path d="M20 359h660" stroke="#d8d3cc" strokeWidth="2" />

      {/* Small night window with a clear crescent moon. */}
      <g aria-hidden="true">
        <rect x="475" y="47" width="148" height="111" rx="5" fill="#687586" stroke="#4c5663" strokeWidth="2" />
        <path d="M549 48v108m-73-53h145" stroke="#8c96a2" strokeWidth="1.5" />
        <path d="M499 71a13 13 0 1 0 18 18 14 14 0 0 1-18-18z" fill="#eee3c8" />
        <circle cx="583" cy="71" r="2" fill="#e2e3df" />
        <circle cx="600" cy="91" r="1.5" fill="#e2e3df" />
        <circle cx="568" cy="116" r="1.5" fill="#e2e3df" />
        <path d="M469 160h160" stroke="#9e968c" strokeWidth="3" strokeLinecap="round" />
      </g>

      <SleepingPerson />
      <NightstandAndLamp />
      <DeskAndLaptop />
    </svg>
    <p className="scene-disclosure">Example only. Payment depends on the requester selecting your work.</p>
  </div>;
}
