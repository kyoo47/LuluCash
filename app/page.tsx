"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback, memo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Menu } from "lucide-react"
import "./lottery.css"
import { getSocket } from "@/lib/socket";

interface NumberBox {
  id: string
  date: string
  time: string
  drawTime: Date
  pick2: number[]
  pick3: number[]
  pick4: number[]
  pick5: number[]
}

interface StateResult {
  id: string
  state: string
  pick3: number[]
  pick4: number[]
  type: "today" | "yesterday"
  timestamp?: Date
}

/* -------------------------------------------
   StateTicker: JS-driven infinite conveyor
-------------------------------------------- */
function resultsSame(a: StateResult[], b: StateResult[]) {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false
  }
  return true
}

const StateTicker = memo(function StateTicker({ results }: { results: StateResult[] }) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track) return

    // If user prefers reduced motion, do nothing.
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }

    // If content doesn't overflow, don't animate.
    const needsScroll = track.scrollWidth > viewport.clientWidth + 4
    if (!needsScroll) {
      track.style.transform = "translateX(0px)"
      return
    }

    let raf = 0
    let lastTs = 0
    let offset = 0
    const SPEED = 60 // px per second; tweak if you want faster/slower

    const step = (ts: number) => {
      if (!lastTs) lastTs = ts
      const dt = (ts - lastTs) / 1000
      lastTs = ts

      offset -= SPEED * dt
      track.style.transform = `translateX(${offset}px)`

      // When the first child fully leaves the viewport, move it to the end.
      const first = track.children[0] as HTMLElement | undefined
      if (first) {
        const styles = window.getComputedStyle(first)
        const mr = parseFloat(styles.marginRight || "0") || 0
        const firstWidth = first.offsetWidth + mr
        if (-offset >= firstWidth) {
          // Append first node to the end and adjust offset so there's no jump.
          track.appendChild(first)
          offset += firstWidth
          track.style.transform = `translateX(${offset}px)`
        }
      }

      raf = requestAnimationFrame(step)
    }

    // Pause the animation when the tab is hidden to save resources
    const onVis = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        lastTs = 0
      } else if (!raf) {
        raf = requestAnimationFrame(step)
      }
    }

    document.addEventListener("visibilitychange", onVis)
    raf = requestAnimationFrame(step)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener("visibilitychange", onVis)
      track.style.transform = "translateX(0px)"
    }
  }, [/* re-init only when IDs/order change */ results.map(r => r.id).join("|")])

  if (!results?.length) return null

  return (
    <div className="state-lottery-banner">
      <h2 className="state-lottery-header">State Lottery Results</h2>
      <div className="state-ticker" ref={viewportRef}>
        <div className="state-track" ref={trackRef}>
          {results.map((result) => (
            <div key={result.id} className="state-result-box">
              <div className="state-name-header">{result.state}</div>
              <div className={`state-tag ${result.type}`}>{result.type === "today" ? "Today" : "Yesterday"}</div>
              <div className="state-numbers">
                {result.pick3.length > 0 && (
                  <div className="state-pick-row">
                    <span className="state-pick-label">P3</span>
                    <div className="state-balls">
                      {result.pick3.map((num, index) => (
                        <div key={index} className="state-ball">
                          {num}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {result.pick4.length > 0 && (
                  <div className="state-pick-row">
                    <span className="state-pick-label">P4</span>
                    <div className="state-balls">
                      {result.pick4.map((num, index) => (
                        <div key={index} className="state-ball">
                          {num}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}, (prev, next) => resultsSame(prev.results, next.results))

/* -------------------------------------------
   Main page component
-------------------------------------------- */
export default function InstantCashUI() {
  // Handle remote:update events (edit or add from remote)
  const handleRemoteUpdate = useCallback((data: any) => {
    if (data && data.selectedTime) {
      setNumberBoxes(prev => {
        const newPick2 = data.pick2 ? data.pick2.split("").map((n: string) => parseInt(n)) : [];
        const newPick3 = data.pick3 ? data.pick3.split("").map((n: string) => parseInt(n)) : [];
        const newPick4 = data.pick4 ? data.pick4.split("").map((n: string) => parseInt(n)) : [];
        const newPick5 = data.pick5 ? data.pick5.split("").map((n: string) => parseInt(n)) : [];

        // Prefer matching by originalTime if present (for edits that change the time slot)
        let foundIdx = -1;
        if (data.originalTime) {
          foundIdx = prev.findIndex(box => box.time === data.originalTime);
        }
        // If not found by originalTime, try selectedTime (for new adds or legacy clients)
        if (foundIdx === -1) {
          foundIdx = prev.findIndex(box => box.time === data.selectedTime);
        }

        if (foundIdx !== -1) {
          // If numbers and time are identical, just return prev (no-op)
          const box = prev[foundIdx];
          const same =
            JSON.stringify(box.pick2) === JSON.stringify(newPick2) &&
            JSON.stringify(box.pick3) === JSON.stringify(newPick3) &&
            JSON.stringify(box.pick4) === JSON.stringify(newPick4) &&
            JSON.stringify(box.pick5) === JSON.stringify(newPick5) &&
            box.time === data.selectedTime;
          if (same) return prev;
          // Otherwise, update the box (including time slot)
          const updated = [...prev];
          updated[foundIdx] = {
            ...box,
            pick2: newPick2,
            pick3: newPick3,
            pick4: newPick4,
            pick5: newPick5,
            time: data.selectedTime
          };
          return updated;
        }
        // If not found, add as new
        const now = new Date();
        const drawTime = now;
        const newBox = {
          id: Date.now().toString(),
          date: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          time: data.selectedTime,
          drawTime,
          pick2: newPick2,
          pick3: newPick3,
          pick4: newPick4,
          pick5: newPick5
        };
        return [newBox, ...prev];
      });
    }
  }, []);
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 })
  const [pin, setPin] = useState("")
  const socketRef = useRef<any>(null)
  const [currentDateTime, setCurrentDateTime] = useState("")
  const [numberBoxes, setNumberBoxes] = useState<NumberBox[]>([])
  const [pick2Input, setPick2Input] = useState("")
  const [pick3Input, setPick3Input] = useState("")
  const [pick4Input, setPick4Input] = useState("")
  const [pick5Input, setPick5Input] = useState("")
  const [selectedTime, setSelectedTime] = useState("")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showYesterdayPopup, setShowYesterdayPopup] = useState(false)
  const [yesterdayInputs, setYesterdayInputs] = useState<{
    [key: string]: { pick2: string; pick3: string; pick4: string; pick5: string }
  }>({})

  const [stateResults, setStateResults] = useState<StateResult[]>([])
  const [showTodayStatePopup, setShowTodayStatePopup] = useState(false)
  const [showYesterdayStatePopup, setShowYesterdayStatePopup] = useState(false)
  const [todayStateInputs, setTodayStateInputs] = useState<{ [key: string]: { pick3: string; pick4: string } }>({})
  const [yesterdayStateInputs, setYesterdayStateInputs] = useState<{ [key: string]: { pick3: string; pick4: string } }>({})

  const pick2Ref = useRef<HTMLInputElement>(null)
  const pick3Ref = useRef<HTMLInputElement>(null)
  const pick4Ref = useRef<HTMLInputElement>(null)
  const pick5Ref = useRef<HTMLInputElement>(null)

  const yesterdayDrawTimes = [
    "10:00 PM","9:30 PM","9:00 PM","8:30 PM","8:00 PM","7:30 PM",
    "7:00 PM","6:30 PM","6:00 PM","5:30 PM","5:00 PM","4:30 PM",
  ]

  const stateNames = [
    "Georgia Morning","Georgia Midday","Georgia Night",
    "New Jersey Day","New Jersey Night",
    "Connecticut Day","Connecticut Night",
    "Florida Day","Florida Night",
    "Pennsylvania Day","Pennsylvania Night",
    "New York Day","New York Night",
  ]

  const updateDateTime = useCallback(() => {
    const now = new Date()
    const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }))
    setCurrentDateTime(
      `📅 ${nyTime.toLocaleDateString("en-US", {
        month: "numeric", day: "numeric", year: "numeric",
      })} ⏰ ${nyTime.toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
      })}`,
    )
  }, [])

  const updateCountdown = useCallback(() => {
    const now = new Date()
    const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }))
    const currentHour = nyTime.getHours()
    const currentMinute = nyTime.getMinutes()
    const currentSecond = nyTime.getSeconds()

    if (currentHour >= 10 && currentHour < 22) {
      const totalMinutesIntoHour = currentMinute
      const totalSecondsIntoHour = totalMinutesIntoHour * 60 + currentSecond
      const cyclePosition = totalSecondsIntoHour % (60 * 60)
      let targetSeconds = 0
      if (cyclePosition < 30 * 60) targetSeconds = 30 * 60 - cyclePosition
      else if (cyclePosition < 35 * 60) targetSeconds = 0
      else targetSeconds = 60 * 60 - cyclePosition

      const hours = Math.floor(targetSeconds / 3600)
      const minutes = Math.floor((targetSeconds % 3600) / 60)
      const seconds = targetSeconds % 60
      setTimeLeft({ hours, minutes, seconds })
    } else {
      const nextTenAM = new Date(nyTime)
      if (currentHour >= 22) nextTenAM.setDate(nextTenAM.getDate() + 1)
      nextTenAM.setHours(10, 0, 0, 0)
      const diff = nextTenAM.getTime() - nyTime.getTime()
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      setTimeLeft({ hours, minutes, seconds })
    }
  }, [])

  useEffect(() => {
    updateDateTime()
    const i = setInterval(updateDateTime, 1000)
    return () => clearInterval(i)
  }, [updateDateTime])

  useEffect(() => {
    updateCountdown()
    const i = setInterval(updateCountdown, 1000)
    return () => clearInterval(i)
  }, [updateCountdown])
  
  // Manage focus and dropdown behavior
  useEffect(() => {
    if (!isDropdownOpen) return
    
    // Handle outside clicks to close dropdown
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.custom-dropdown') && !target.closest('.menu-button')) {
        setIsDropdownOpen(false)
      }
    }
    
    // Handle keyboard navigation in the dropdown - ONLY for Escape key
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only close dropdown on Escape key
      if (event.key === 'Escape') {
        setIsDropdownOpen(false)
      }
      // No Enter key handling here - let individual input handlers manage that
    }
    
    // Focus the first input when dropdown opens
    const pinInput = document.getElementById('controller-pin')
    if (pinInput) {
      setTimeout(() => {
        pinInput.focus()
      }, 50)
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown) // Removed capture phase
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDropdownOpen])

  // Socket state - with remote:update handler
  useEffect(() => {
    socketRef.current = getSocket();

    const onState = (st: any) => {
      console.log("Received state update:", st);
      setNumberBoxes(st.numberBoxes || []);
      setStateResults(st.stateResults || []);
    };

    const onHello = (data: any) => {
      console.log("Socket connected:", data);
    };

    const onResultsUpdate = (results: any) => {
      console.log("Received results update:", results);
      // Create a new number box from the results
      const now = new Date();
      const drawTime = now;
      const displayTime = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });
      // Format the results into a number box
      const newBox: NumberBox = {
        id: Date.now().toString(),
        date: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        time: displayTime,
        drawTime,
        pick2: results.P2 ? results.P2.split("").map((n: string) => parseInt(n)) : [],
        pick3: results.P3 ? results.P3.split("").map((n: string) => parseInt(n)) : [],
        pick4: results.P4 ? results.P4.split("").map((n: string) => parseInt(n)) : [],
        pick5: results.P5 ? results.P5.split("").map((n: string) => parseInt(n)) : []
      };
      setNumberBoxes(prev => [newBox, ...prev]);
    };

    const onRemoteUpdate = (data: any) => {
      handleRemoteUpdate(data);
    };

    socketRef.current.on("state", onState);
    socketRef.current.on("hello", onHello);
    socketRef.current.on("results:update", onResultsUpdate);
    socketRef.current.on("remote:update", onRemoteUpdate);
    // Request initial state when connecting
    socketRef.current.emit("getState");

    return () => {
      if (socketRef.current) {
        socketRef.current.off("state", onState);
        socketRef.current.off("hello", onHello);
        socketRef.current.off("results:update", onResultsUpdate);
        socketRef.current.off("remote:update", onRemoteUpdate);
      }
    };
  }, [handleRemoteUpdate]);

  const getNextDrawTime = useCallback(() => {
    const now = new Date()
    const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }))
    const drawTimes: Date[] = []
    for (let hour = 10; hour < 22; hour++) {
      drawTimes.push(new Date(nyTime.getFullYear(), nyTime.getMonth(), nyTime.getDate(), hour, 0))
      drawTimes.push(new Date(nyTime.getFullYear(), nyTime.getMonth(), nyTime.getDate(), hour, 30))
    }
    for (const drawTime of drawTimes) if (drawTime > nyTime) return drawTime
    const tomorrow = new Date(nyTime); tomorrow.setDate(tomorrow.getDate() + 1)
    return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 10, 0)
  }, [])

  const getAutomaticDrawTime = useCallback((boxIndex: number) => {
    const baseHour = 10
    const totalMinutes = boxIndex * 30
    const hours = baseHour + Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours >= 22) {
      const nextDayHours = 10 + Math.floor((totalMinutes - 12 * 60) / 60)
      const nextDayMinutes = (totalMinutes - 12 * 60) % 60
      const displayHour = nextDayHours > 12 ? nextDayHours - 12 : nextDayHours
      const ampm = nextDayHours >= 12 ? "PM" : "AM"
      return `${displayHour}:${nextDayMinutes.toString().padStart(2, "0")} ${ampm}`
    }
    const displayHour = hours > 12 ? hours - 12 : hours
    const ampm = hours >= 12 ? "PM" : "AM"
    return `${displayHour}:${minutes.toString().padStart(2, "0")} ${ampm}`
  }, [])

  const getAvailableTimeOptions = useCallback(() => {
    const times: string[] = []
    for (let hour = 10; hour < 22; hour++) {
      const displayHour = hour > 12 ? hour - 12 : hour
      const ampm = hour >= 12 ? "PM" : "AM"
      times.push(`${displayHour}:00 ${ampm}`)
      times.push(`${displayHour}:30 ${ampm}`)
    }
    return times
  }, [])

  const handleAddNumbers = useCallback(() => {
    const p2 = pick2Input.trim() ? pick2Input.trim().split("").map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9) : []
    const p3 = pick3Input.trim() ? pick3Input.trim().split("").map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9) : []
    const p4 = pick4Input.trim() ? pick4Input.trim().split("").map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9) : []
    const p5 = pick5Input.trim() ? pick5Input.trim().split("").map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9) : []

    if (p2.length !== 2 && pick2Input.trim()) return alert("Pick 2 must have exactly 2 digits (e.g., 12)")
    if (p3.length !== 3 && pick3Input.trim()) return alert("Pick 3 must have exactly 3 digits (e.g., 123)")
    if (p4.length !== 4 && pick4Input.trim()) return alert("Pick 4 must have exactly 4 digits (e.g., 1234)")
    if (p5.length !== 5 && pick5Input.trim()) return alert("Pick 5 must have exactly 5 digits (e.g., 12345)")
    if (!pick2Input.trim() && !pick3Input.trim() && !pick4Input.trim() && !pick5Input.trim()) return alert("Please enter numbers for at least one draw type")
    if (!selectedTime.trim()) return alert("Please select a time for this draw")

    const drawTime = getNextDrawTime()
    const displayTime = selectedTime || getAutomaticDrawTime(numberBoxes.length)

    const newBox: NumberBox = {
      id: Date.now().toString(),
      date: drawTime.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      time: displayTime,
      drawTime,
      pick2: p2, pick3: p3, pick4: p4, pick5: p5,
    }

    setNumberBoxes(prev => [newBox, ...prev])
    setPick2Input(""); setPick3Input(""); setPick4Input(""); setPick5Input(""); setSelectedTime(""); setIsDropdownOpen(false)
  }, [pick2Input, pick3Input, pick4Input, pick5Input, selectedTime, numberBoxes.length, getNextDrawTime, getAutomaticDrawTime])

  const handleYesterdayInputChange = useCallback((time: string, pickType: string, value: string) => {
    setYesterdayInputs(prev => ({
      ...prev,
      [time]: { ...prev[time], [pickType]: value },
    }))
  }, [])

  const handleAddYesterdayNumbers = useCallback(() => {
    const yesterdayBoxes: NumberBox[] = []
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)

    yesterdayDrawTimes.forEach(time => {
      const inputs = yesterdayInputs[time]; if (!inputs) return
      const p2 = inputs.pick2?.trim() ? inputs.pick2.trim().split("").map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9) : []
      const p3 = inputs.pick3?.trim() ? inputs.pick3.trim().split("").map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9) : []
      const p4 = inputs.pick4?.trim() ? inputs.pick4.trim().split("").map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9) : []
      const p5 = inputs.pick5?.trim() ? inputs.pick5.trim().split("").map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9) : []
      if (p2.length || p3.length || p4.length || p5.length) {
        yesterdayBoxes.push({
          id: `yesterday-${time}-${Date.now()}`,
          date: yesterday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          time, drawTime: yesterday, pick2: p2, pick3: p3, pick4: p4, pick5: p5,
        })
      }
    })

    setNumberBoxes(prev => [...yesterdayBoxes, ...prev])
    setYesterdayInputs({})
    setShowYesterdayPopup(false)
  }, [yesterdayInputs, yesterdayDrawTimes])

  const renderAllNumbers = useCallback((box: NumberBox) => {
    const rows: React.ReactNode[] = []
    if (box.pick2.length > 0) rows.push(
      <div key="row1" className="pyramid-row row-1">
        <div className="clover-icon">🍀</div><div className="pick-label">P2</div>
        {box.pick2.map((n, i) => <div key={i} className="lottery-ball">{n}</div>)}
      </div>
    )
    if (box.pick3.length > 0) rows.push(
      <div key="row2" className="pyramid-row row-2">
        <div className="clover-icon">🍀</div><div className="pick-label">P3</div>
        {box.pick3.map((n, i) => <div key={i} className="lottery-ball">{n}</div>)}
      </div>
    )
    if (box.pick4.length > 0) rows.push(
      <div key="row3" className="pyramid-row row-3">
        <div className="clover-icon">🍀</div><div className="pick-label">P4</div>
        {box.pick4.map((n, i) => <div key={i} className="lottery-ball">{n}</div>)}
      </div>
    )
    if (box.pick5.length > 0) rows.push(
      <div key="row4" className="pyramid-row row-4">
        <div className="clover-icon">🍀</div><div className="pick-label">P5</div>
        {box.pick5.map((n, i) => <div key={i} className="lottery-ball">{n}</div>)}
      </div>
    )
    return rows
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, currentField: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation(); // Stop event propagation to prevent dropdown closing
      console.log(`Enter pressed in ${currentField}, focusing next field`);
      
      // Delay focus to ensure it works properly in the dropdown
      setTimeout(() => {
        switch (currentField) {
          case "pick2": 
            console.log("Focusing pick3");
            pick3Ref.current?.focus(); 
            break;
          case "pick3": 
            console.log("Focusing pick4");
            pick4Ref.current?.focus(); 
            break;
          case "pick4": 
            console.log("Focusing pick5");
            pick5Ref.current?.focus(); 
            break;
          case "pick5": 
            console.log("Submitting form");
            handleAddNumbers(); 
            break;
        }
      }, 10);
    }
  }, [handleAddNumbers])

  const handleReset = useCallback(() => setShowResetConfirm(true), [])

  const confirmReset = useCallback(() => {
    if (!pin.trim()) {
      alert("Enter Controller PIN")
      setShowResetConfirm(false)
      return
    }
    
    // Send reset command to remote API
    fetch('/api/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, action: 'resetAll' })
    })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        console.log("Reset successful")
        // The state will be updated via socket event
      } else {
        console.error("Reset failed:", data.error)
        alert(data.error || "Reset failed")
      }
    })
    .catch(err => {
      console.error("Reset error:", err)
      alert("Network error during reset")
    })
    
    setShowResetConfirm(false)
  }, [pin])

  const cancelReset = useCallback(() => setShowResetConfirm(false), [])

  const handleYesterdayKeyDown = useCallback((e: React.KeyboardEvent, time: string) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const timeIndex = yesterdayDrawTimes.indexOf(time)
      const currentTimeInputs = document.querySelectorAll(`[data-time="${time}"] input`)
      const currentInput = e.target as HTMLInputElement
      const currentIndex = Array.from(currentTimeInputs).indexOf(currentInput)
      if (currentIndex < currentTimeInputs.length - 1) {
        ;(currentTimeInputs[currentIndex + 1] as HTMLInputElement).focus()
      } else if (timeIndex < yesterdayDrawTimes.length - 1) {
        const nextTime = yesterdayDrawTimes[timeIndex + 1]
        const nextTimeInputs = document.querySelectorAll(`[data-time="${nextTime}"] input`)
        if (nextTimeInputs.length > 0) {
          ;(nextTimeInputs[0] as HTMLInputElement).focus()
        }
      }
    }
  }, [yesterdayDrawTimes])

  const handleTodayStateInputChange = useCallback((state: string, pickType: string, value: string) => {
    setTodayStateInputs(prev => ({ ...prev, [state]: { ...prev[state], [pickType]: value } }))
  }, [])

  const handleYesterdayStateInputChange = useCallback((state: string, pickType: string, value: string) => {
    setYesterdayStateInputs(prev => ({ ...prev, [state]: { ...prev[state], [pickType]: value } }))
  }, [])

  const handleAddTodayStateNumbers = useCallback(() => {
    const newStateResults: StateResult[] = []
    const today = new Date()
    stateNames.forEach(state => {
      const inputs = todayStateInputs[state]; if (!inputs) return
      const p3 = inputs.pick3?.trim() ? inputs.pick3.trim().split("").map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9) : []
      const p4 = inputs.pick4?.trim() ? inputs.pick4.trim().split("").map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9) : []
      if (p3.length === 3 || p4.length === 4) {
        newStateResults.push({ id: `today-${state}-${Date.now()}`, state, pick3: p3, pick4: p4, type: "today", timestamp: today })
      }
    })
    setStateResults(prev => [...prev, ...newStateResults])
    setTodayStateInputs({})
    setShowTodayStatePopup(false)
  }, [todayStateInputs, stateNames])

  const handleAddYesterdayStateNumbers = useCallback(() => {
    const newStateResults: StateResult[] = []
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    stateNames.forEach(state => {
      const inputs = yesterdayStateInputs[state]; if (!inputs) return
      const p3 = inputs.pick3?.trim() ? inputs.pick3.trim().split("").map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9) : []
      const p4 = inputs.pick4?.trim() ? inputs.pick4.trim().split("").map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 0 && n <= 9) : []
      if (p3.length === 3 || p4.length === 4) {
        newStateResults.push({ id: `yesterday-${state}-${Date.now()}`, state, pick3: p3, pick4: p4, type: "yesterday", timestamp: yesterday })
      }
    })
    setStateResults(prev => [...prev, ...newStateResults])
    setYesterdayStateInputs({})
    setShowYesterdayStatePopup(false)
  }, [yesterdayStateInputs, stateNames])

  const handleStateKeyDown = useCallback((e: React.KeyboardEvent, state: string, _currentField: string, type: "today" | "yesterday") => {
    if (e.key === "Enter") {
      e.preventDefault()
      const stateIndex = stateNames.indexOf(state)
      const currentStateInputs = document.querySelectorAll(`[data-state="${state}"][data-type="${type}"] input`)
      const currentInput = e.target as HTMLInputElement
      const currentIndex = Array.from(currentStateInputs).indexOf(currentInput)
      if (currentIndex < currentStateInputs.length - 1) {
        ;(currentStateInputs[currentIndex + 1] as HTMLInputElement).focus()
      } else if (stateIndex < stateNames.length - 1) {
        const nextState = stateNames[stateIndex + 1]
        const nextStateInputs = document.querySelectorAll(`[data-state="${nextState}"][data-type="${type}"] input`)
        if (nextStateInputs.length > 0) {
          ;(nextStateInputs[0] as HTMLInputElement).focus()
        }
      }
    }
  }, [stateNames])

  return (
    <div className="lottery-container">
      <header className="lottery-header">
        <div className="logo-section">
          <img
            src="/instant-cash-logo.png"
            alt="Instant Cash"
            className="logo-image"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
          <div className="header-animated-text">INSTANT CASH</div>
        </div>

        <div className="countdown-section">
          <div className="next-drawing-label">🔥 NEXT DRAWING</div>
          <div className="countdown-timer">
            <div className="time-unit"><span className="time-value">{String(timeLeft.hours).padStart(2, "0")}</span><span className="time-label">H</span></div>
            <div className="time-unit"><span className="time-value">{String(timeLeft.minutes).padStart(2, "0")}</span><span className="time-label">M</span></div>
            <div className="time-unit"><span className="time-value">{String(timeLeft.seconds).padStart(2, "0")}</span><span className="time-label">S</span></div>
          </div>
        </div>

        <div className="header-right">
          <div className="website-animated-text">VISIT-instantcash.bet to watch live result from your phone</div>
          <div className="current-time">{currentDateTime}</div>
          <div className="custom-dropdown-container">
            <Button 
              className="menu-button" 
              type="button" 
              aria-label="Open menu" 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            
            {isDropdownOpen && (
              <div className="custom-dropdown dropdown-content-wide">
                <div className="all-inputs-container">
                  <h3 className="dropdown-title">Enter Today's Numbers</h3>

                  <div className="input-group">
                    <label className="input-label">Controller PIN</label>
                    <Input 
                      inputMode="numeric" 
                      pattern="[0-9]*" 
                      placeholder="2468" 
                      value={pin} 
                      onChange={(e) => setPin(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Moving focus from PIN to time selection");
                          const timeSelect = document.querySelector('.time-select');
                          if (timeSelect) {
                            (timeSelect as HTMLElement).focus();
                          } else {
                            pick2Ref.current?.focus();
                          }
                        }
                      }} 
                      className="draw-input" 
                      id="controller-pin"
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Select Draw Time</label>
                    <select 
                      value={selectedTime} 
                      onChange={(e) => setSelectedTime(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Moving focus from time selection to Pick 2");
                          pick2Ref.current?.focus();
                        }
                      }}
                      className="time-select"
                      id="draw-time-select"
                    >
                      <option value="">Choose a time...</option>
                      {getAvailableTimeOptions().map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Pick 2 (Two digits)</label>
                    <Input 
                      ref={pick2Ref} 
                      inputMode="numeric" 
                      pattern="[0-9]*" 
                      placeholder="e.g., 12" 
                      value={pick2Input} 
                      onChange={(e) => setPick2Input(e.target.value)} 
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Directly focusing pick3 from pick2");
                          pick3Ref.current?.focus();
                        }
                      }} 
                      className="draw-input" 
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Pick 3 (Three digits)</label>
                    <Input 
                      ref={pick3Ref} 
                      inputMode="numeric" 
                      pattern="[0-9]*" 
                      placeholder="e.g., 123" 
                      value={pick3Input} 
                      onChange={(e) => setPick3Input(e.target.value)} 
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Directly focusing pick4 from pick3");
                          pick4Ref.current?.focus();
                        }
                      }} 
                      className="draw-input" 
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Pick 4 (Four digits)</label>
                    <Input 
                      ref={pick4Ref} 
                      inputMode="numeric" 
                      pattern="[0-9]*" 
                      placeholder="e.g., 1234" 
                      value={pick4Input} 
                      onChange={(e) => setPick4Input(e.target.value)} 
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Directly focusing pick5 from pick4");
                          pick5Ref.current?.focus();
                        }
                      }} 
                      className="draw-input" 
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Pick 5 (Five digits)</label>
                    <Input 
                      ref={pick5Ref} 
                      inputMode="numeric" 
                      pattern="[0-9]*" 
                      placeholder="e.g., 12345" 
                      value={pick5Input} 
                      onChange={(e) => setPick5Input(e.target.value)} 
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Submitting form from pick5");
                          handleAddNumbers();
                        }
                      }} 
                      className="draw-input" 
                    />
                  </div>

                  <div className="dropdown-buttons">
                    <Button onClick={handleAddNumbers} className="submit-btn" type="button">Add to Today's Draws</Button>
                    <Button onClick={() => { setShowTodayStatePopup(true); setIsDropdownOpen(false) }} className="today-state-btn" type="button">Add Today State Numbers</Button>
                    <Button onClick={() => { setShowYesterdayStatePopup(true); setIsDropdownOpen(false) }} className="yesterday-state-btn" type="button">Add Yesterday State Numbers</Button>
                    <Button onClick={() => { setShowYesterdayPopup(true); setIsDropdownOpen(false) }} className="yesterday-btn" type="button">ADD YESTERDAY NUMBERS</Button>
                    <Button onClick={handleReset} variant="destructive" className="reset-btn" type="button">Reset All</Button>
                    <Button onClick={() => { setPick2Input(""); setPick3Input(""); setPick4Input(""); setPick5Input(""); setSelectedTime(""); setIsDropdownOpen(false) }} variant="outline" className="cancel-btn" type="button">Cancel</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="numbers-grid">
        {numberBoxes.map((box, index) => (
          <div key={box.id} className={`number-box ${index === 0 ? "live-box" : ""} ${box.id.includes("yesterday") ? "yesterday-box" : ""}`}>
            {box.id.includes("yesterday") && <div className="yesterday-banner">YESTERDAY</div>}
            <div className="box-header">
              {index === 0 && <div className="live-indicator">LIVE</div>}
              <div className="date-display">📅 {box.date}</div>
              <div className="time-display">⏰ {box.time}</div>
            </div>
            <div className="box-content">
              <div className="pyramid-container">{renderAllNumbers(box)}</div>
            </div>
          </div>
        ))}
      </main>

      {/* NEW: JS-driven infinite ticker */}
      <StateTicker results={stateResults} />

      {showTodayStatePopup && (
        <div className="state-overlay">
          <div className="state-popup">
            <div className="state-header">
              <h2>Add Today's State Numbers</h2>
              <p>Enter Pick 3 and Pick 4 numbers for today's state draws</p>
            </div>
            <div className="state-content">
              {stateNames.map((state) => (
                <div key={state} className="state-draw-section" data-state={state} data-type="today">
                  <h3 className="state-name">{state}</h3>
                  <div className="state-inputs">
                    <div className="state-input-group">
                      <label>Pick 3</label>
                      <Input inputMode="numeric" pattern="[0-9]*" placeholder="123" value={todayStateInputs[state]?.pick3 || ""} onChange={(e) => handleTodayStateInputChange(state, "pick3", e.target.value)} onKeyDown={(e) => handleStateKeyDown(e, state, "pick3", "today")} className="state-input" />
                    </div>
                    <div className="state-input-group">
                      <label>Pick 4</label>
                      <Input inputMode="numeric" pattern="[0-9]*" placeholder="1234" value={todayStateInputs[state]?.pick4 || ""} onChange={(e) => handleTodayStateInputChange(state, "pick4", e.target.value)} onKeyDown={(e) => handleStateKeyDown(e, state, "pick4", "today")} className="state-input" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="state-buttons">
              <Button onClick={handleAddTodayStateNumbers} className="state-submit-btn">Add Today State Numbers</Button>
              <Button onClick={() => setShowTodayStatePopup(false)} variant="outline" className="state-cancel-btn">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {showYesterdayStatePopup && (
        <div className="state-overlay">
          <div className="state-popup">
            <div className="state-header">
              <h2>Add Yesterday's State Numbers</h2>
              <p>Enter Pick 3 and Pick 4 numbers for yesterday's state draws</p>
            </div>
            <div className="state-content">
              {stateNames.map((state) => (
                <div key={state} className="state-draw-section" data-state={state} data-type="yesterday">
                  <h3 className="state-name">{state}</h3>
                  <div className="state-inputs">
                    <div className="state-input-group">
                      <label>Pick 3</label>
                      <Input inputMode="numeric" pattern="[0-9]*" placeholder="123" value={yesterdayStateInputs[state]?.pick3 || ""} onChange={(e) => handleYesterdayStateInputChange(state, "pick3", e.target.value)} onKeyDown={(e) => handleStateKeyDown(e, state, "pick3", "yesterday")} className="state-input" />
                    </div>
                    <div className="state-input-group">
                      <label>Pick 4</label>
                      <Input inputMode="numeric" pattern="[0-9]*" placeholder="1234" value={yesterdayStateInputs[state]?.pick4 || ""} onChange={(e) => handleYesterdayStateInputChange(state, "pick4", e.target.value)} onKeyDown={(e) => handleStateKeyDown(e, state, "pick4", "yesterday")} className="state-input" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="state-buttons">
              <Button onClick={handleAddYesterdayStateNumbers} className="state-submit-btn">Add Yesterday State Numbers</Button>
              <Button onClick={() => setShowYesterdayStatePopup(false)} variant="outline" className="state-cancel-btn">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {showYesterdayPopup && (
        <div className="yesterday-overlay">
          <div className="yesterday-popup">
            <div className="yesterday-header">
              <h2>Add Yesterday's Numbers</h2>
              <p>Enter numbers for yesterday's draws (4:30 PM - 10:00 PM)</p>
            </div>
            <div className="yesterday-content">
              {yesterdayDrawTimes.map((time) => (
                <div key={time} className="yesterday-draw-section" data-time={time}>
                  <h3 className="yesterday-time">{time}</h3>
                  <div className="yesterday-inputs">
                    <div className="yesterday-input-group">
                      <label>P2</label>
                      <Input inputMode="numeric" pattern="[0-9]*" placeholder="12" value={yesterdayInputs[time]?.pick2 || ""} onChange={(e) => handleYesterdayInputChange(time, "pick2", e.target.value)} onKeyDown={(e) => handleYesterdayKeyDown(e, time)} className="yesterday-input" />
                    </div>
                    <div className="yesterday-input-group">
                      <label>P3</label>
                      <Input inputMode="numeric" pattern="[0-9]*" placeholder="123" value={yesterdayInputs[time]?.pick3 || ""} onChange={(e) => handleYesterdayInputChange(time, "pick3", e.target.value)} onKeyDown={(e) => handleYesterdayKeyDown(e, time)} className="yesterday-input" />
                    </div>
                    <div className="yesterday-input-group">
                      <label>P4</label>
                      <Input inputMode="numeric" pattern="[0-9]*" placeholder="1234" value={yesterdayInputs[time]?.pick4 || ""} onChange={(e) => handleYesterdayInputChange(time, "pick4", e.target.value)} onKeyDown={(e) => handleYesterdayKeyDown(e, time)} className="yesterday-input" />
                    </div>
                    <div className="yesterday-input-group">
                      <label>P5</label>
                      <Input inputMode="numeric" pattern="[0-9]*" placeholder="12345" value={yesterdayInputs[time]?.pick5 || ""} onChange={(e) => handleYesterdayInputChange(time, "pick5", e.target.value)} onKeyDown={(e) => handleYesterdayKeyDown(e, time)} className="yesterday-input" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="yesterday-buttons">
              <Button onClick={handleAddYesterdayNumbers} className="yesterday-submit-btn">Add Yesterday Numbers</Button>
              <Button onClick={() => setShowYesterdayPopup(false)} variant="outline" className="yesterday-cancel-btn">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="reset-overlay">
          <div className="reset-dialog">
            <h3>Are you sure you want to reset?</h3>
            <p>This will remove all number boxes from the page.</p>
            <div className="reset-buttons">
              <Button onClick={confirmReset} variant="destructive">Yes</Button>
              <Button onClick={cancelReset} variant="outline">No</Button>
            </div>
          </div>
        </div>
      )}

      {numberBoxes.length === 0 && stateResults.length === 0 && (
        <div className="empty-state">
          <div className="empty-message">
            <h2>Welcome to Instant Cash</h2>
            <p>Click the menu button in the top-right corner to start adding your numbers!</p>
          </div>
        </div>
      )}
    </div>
  )
}