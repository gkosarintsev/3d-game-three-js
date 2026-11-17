interface TitleOverlayProps {
  onStart: () => void;
}

export function TitleOverlay({ onStart }: TitleOverlayProps) {
  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 md:p-10">
      {/* Left-third negative-space lockup over live 3D orbit */}
      <div className="my-auto max-w-sm pointer-events-auto">
        <div
          className="p-6 rounded-xl border border-white/12 shadow-2xl"
          style={{ backgroundColor: 'rgba(13, 16, 20, 0.88)' }}
        >
          {/* Bespoke inline SVG motorsport emblem */}
          <div className="flex items-center gap-3.5 mb-4">
            <svg width="42" height="42" viewBox="0 0 44 44" aria-hidden="true" className="shrink-0">
              <polygon
                points="22,3 40,13 40,31 22,41 4,31 4,13"
                fill="#161b22"
                stroke="#f59e0b"
                strokeWidth="2.2"
              />
              <path
                d="M12 29 L22 11 L32 29 M16 24 H28"
                fill="none"
                stroke="#f8fafc"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <h1 className="font-display text-4xl font-bold tracking-tight text-white leading-none">
                APEX DRIVE
              </h1>
              <p className="text-xs text-slate-300 mt-1.5 tracking-wide whitespace-nowrap">
                3D автосимулятор · Полигон и трасса
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-slate-300 mb-5 pb-4 border-b border-white/10 whitespace-nowrap">
            <span>Подвеска 4×4</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span>1-е и 3-е лицо</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span>Физика дрифта</span>
          </div>

          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="w-full py-3.5 px-6 rounded-lg font-semibold text-sm tracking-wide text-slate-950 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 whitespace-nowrap"
          >
            Выехать на трассу
          </button>
        </div>
      </div>

      {/* Single flat borderless inline control hint */}
      <div className="text-center text-xs md:text-sm text-white/90 font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
        WASD / Стрелки — газ, тормоз, руль · Пробел — ручник · C — смена камеры (1-е / 3-е лицо) · R — сброс · Esc — пауза
      </div>
    </div>
  );
}
