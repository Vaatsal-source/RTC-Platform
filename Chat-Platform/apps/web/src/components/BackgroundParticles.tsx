import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Particle {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  size: number;
  duration: number;
  delay: number;
}

export default function BackgroundParticles() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const initialParticles = Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      startX: Math.random() * 100,
      startY: Math.random() * 100,
      endX: Math.random() * 100 + (Math.random() * 20 - 10),
      endY: Math.random() * 100 + (Math.random() * 20 - 10),
      size: Math.random() * 3 + 2,
      duration: Math.random() * 20 + 20, 
      delay: Math.random() * -10,
    }));
    setParticles(initialParticles);
  }, []);

  return (
    // REMOVED bg-[#000000] so it doesn't block the image beneath it
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      {/* ATMOSPHERIC NEON ACCENT BLURS */}
      <div className="absolute top-[20%] left-[10%] h-[500px] w-[500px] rounded-full bg-indigo-600/10 blur-[130px]" />
      <div className="absolute top-[40%] right-[10%] h-[500px] w-[500px] rounded-full bg-fuchsia-600/10 blur-[140px]" />

      {/* FLOATING NEON DRIFT PARTICLES */}
      {particles.map((p) => (
        <motion.div
          key={p.id}
          // INCREASED opacity and shadow intensity so they are visible over the dark background
          className="absolute rounded-full bg-gradient-to-tr from-purple-400 to-fuchsia-300 opacity-60 shadow-[0_0_12px_rgba(168,85,247,0.8)]"
          style={{
            width: `${p.size}px`,
            height: `${p.size}px`,
          }}
          initial={{
            x: `${p.startX}vw`,
            y: `${p.startY}vh`,
          }}
          animate={{
            x: [`${p.startX}vw`, `${p.endX}vw`, `${p.startX}vw`],
            y: [`${p.startY}vh`, `${p.endY}vh`, `${p.startY}vh`],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: p.delay,
          }}
        />
      ))}
    </div>
  );
}