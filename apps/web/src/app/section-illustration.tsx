type IllustrationKind =
  | "students"
  | "teachers"
  | "classes"
  | "schedules"
  | "events"
  | "assessments"
  | "behavior";

interface SectionIllustrationProps {
  kind: IllustrationKind;
}

export function SectionIllustration({ kind }: SectionIllustrationProps) {
  const illustration = {
    students: (
      <>
        <circle cx="185" cy="48" r="25" fill="#FFC85B" />
        <path d="M37 157c19-20 45-22 68-4 22-27 53-27 78 0 23-22 49-18 71 4v30H37v-30Z" fill="#B7DDBE" />
        <path d="M89 107c0-22 15-38 34-38s34 16 34 38v35H89v-35Z" fill="#F2A477" stroke="#38463B" strokeWidth="4" />
        <circle cx="123" cy="58" r="23" fill="#E8AE83" stroke="#38463B" strokeWidth="4" />
        <path d="M102 55c0-17 10-28 25-28 13 0 22 9 23 23-10-7-24-9-39-5l-9 10Z" fill="#55453C" />
        <path d="M170 112c0-18 12-31 28-31s28 13 28 31v30h-56v-30Z" fill="#89BBD1" stroke="#38463B" strokeWidth="4" />
        <circle cx="198" cy="68" r="20" fill="#D99973" stroke="#38463B" strokeWidth="4" />
        <path d="M179 65c2-15 11-23 23-23 11 0 18 7 19 18-13-5-26-4-42 5Z" fill="#3C3835" />
        <path d="M66 141h63l-8 31H72l-6-31Zm108 0h46l-6 28h-35l-5-28Z" fill="#FFF9ED" stroke="#38463B" strokeWidth="4" strokeLinejoin="round" />
        <path d="M79 151h35m-23 9h22m70-9h22" stroke="#D99C54" strokeWidth="3" strokeLinecap="round" />
        <path d="m52 61 4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1 4-8Z" fill="#E97855" />
      </>
    ),
    teachers: (
      <>
        <circle cx="216" cy="44" r="23" fill="#FFC85B" />
        <rect x="57" y="46" width="151" height="101" rx="9" fill="#6C9B78" stroke="#38463B" strokeWidth="4" />
        <path d="M77 68h79m-79 14h58" stroke="#F8F3DE" strokeWidth="4" strokeLinecap="round" />
        <path d="m171 67 5 10 11 1-8 7 2 11-10-5-9 5 2-11-8-7 11-1 4-10Z" fill="#FFD47A" />
        <circle cx="94" cy="156" r="20" fill="#E3A47C" stroke="#38463B" strokeWidth="4" />
        <path d="M64 206v-21c0-17 13-29 30-29s30 12 30 29v21H64Z" fill="#D9A36E" stroke="#38463B" strokeWidth="4" />
        <path d="M77 158c-2-17 6-29 19-30 12 0 19 8 21 21-12-5-25-3-40 9Z" fill="#51443C" />
        <path d="M145 162c0-14 10-24 23-24s23 10 23 24v24h-46v-24Z" fill="#F0B1A2" stroke="#38463B" strokeWidth="4" />
        <circle cx="168" cy="112" r="19" fill="#C98D69" stroke="#38463B" strokeWidth="4" />
        <path d="M151 109c2-13 9-20 19-20 10 0 16 6 18 17-11-4-23-3-37 3Z" fill="#403B37" />
        <path d="M230 206c-1-18 5-30 18-37m-17 23c-14-10-24-8-29 5 12 9 22 7 29-5Zm4-9c2-16 11-23 24-19 1 13-7 20-24 19Z" stroke="#548E63" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    classes: (
      <>
        <circle cx="220" cy="44" r="23" fill="#FFC85B" />
        <path d="M55 64h148v89H55z" fill="#6C9B78" stroke="#38463B" strokeWidth="4" />
        <path d="M76 85h92m-92 16h60" stroke="#F8F3DE" strokeWidth="4" strokeLinecap="round" />
        <path d="m176 84 4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1 4-8Z" fill="#FFD47A" />
        <path d="M47 164h174l-12 17H59l-12-17Z" fill="#E5A76F" stroke="#38463B" strokeWidth="4" strokeLinejoin="round" />
        <path d="M66 181v25m136-25v25" stroke="#38463B" strokeWidth="5" strokeLinecap="round" />
        <path d="M86 147h47v16H86z" fill="#E97855" stroke="#38463B" strokeWidth="3" />
        <path d="M91 137h47v16H91z" fill="#F5C45A" stroke="#38463B" strokeWidth="3" />
        <path d="M96 127h47v16H96z" fill="#8DBBC6" stroke="#38463B" strokeWidth="3" />
        <path d="m238 156 10 16-10 15-10-15 10-16Zm-9 16h18m-9-16v31" fill="#E8A6A7" stroke="#38463B" strokeWidth="3" strokeLinejoin="round" />
      </>
    ),
    schedules: (
      <>
        <circle cx="208" cy="53" r="25" fill="#FFC85B" />
        <rect x="56" y="47" width="143" height="150" rx="13" fill="#FFF9ED" stroke="#38463B" strokeWidth="4" />
        <path d="M56 77h143" stroke="#38463B" strokeWidth="4" />
        <path d="M88 39v17m79-17v17" stroke="#38463B" strokeWidth="5" strokeLinecap="round" />
        <path d="M79 99h19v18H79zm39 0h19v18h-19zm39 0h19v18h-19zM79 135h19v18H79zm39 0h19v18h-19zm39 0h19v18h-19z" fill="#B7DDBE" stroke="#548E63" strokeWidth="3" />
        <circle cx="92" cy="175" r="24" fill="#E97855" stroke="#38463B" strokeWidth="4" />
        <path d="M92 160v16l11 7" stroke="#FFF9ED" strokeWidth="4" strokeLinecap="round" />
        <path d="m188 153 38-42 13 12-38 42-18 6 5-18Z" fill="#F5C45A" stroke="#38463B" strokeWidth="4" strokeLinejoin="round" />
        <path d="m219 118 13 12" stroke="#38463B" strokeWidth="4" />
      </>
    ),
    events: (
      <>
        <path d="M39 59c23 20 44 20 67 0 22 20 44 20 67 0 22 20 45 20 68 0v30H39V59Z" fill="#F2A477" stroke="#38463B" strokeWidth="3" strokeLinejoin="round" />
        <path d="M39 59c23 20 44 20 67 0 22 20 44 20 67 0 22 20 45 20 68 0" stroke="#38463B" strokeWidth="3" />
        <path d="M66 42c-21 0-19 26 0 36 19-10 21-36 0-36Z" fill="#E97855" stroke="#38463B" strokeWidth="3" />
        <path d="M199 37c-18 0-17 22 0 31 17-9 18-31 0-31Z" fill="#86B8C6" stroke="#38463B" strokeWidth="3" />
        <path d="M67 78v75m132-85v95" stroke="#38463B" strokeWidth="3" strokeDasharray="5 6" />
        <path d="M65 160c-18-9-23 7-7 20 4 4 7 7 9 11 2-4 5-7 9-11 16-13 11-29-7-20Z" fill="#F5C45A" stroke="#38463B" strokeWidth="3" />
        <path d="M199 181c-18-9-23 7-7 20 4 4 7 7 9 11 2-4 5-7 9-11 16-13 11-29-7-20Z" fill="#E97855" stroke="#38463B" strokeWidth="3" />
        <rect x="102" y="111" width="75" height="62" rx="8" fill="#F5C45A" stroke="#38463B" strokeWidth="4" />
        <path d="M102 130h75m-38-19v62m-37-43 37 25 38-25" stroke="#38463B" strokeWidth="3" />
        <path d="m138 93 4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1 4-8Z" fill="#E97855" />
      </>
    ),
    assessments: (
      <>
        <circle cx="218" cy="48" r="24" fill="#FFC85B" />
        <rect x="59" y="54" width="139" height="149" rx="12" fill="#FFF9ED" stroke="#38463B" strokeWidth="4" />
        <rect x="99" y="42" width="59" height="24" rx="8" fill="#86B8C6" stroke="#38463B" strokeWidth="4" />
        <path d="m76 95 6 6 11-13m8 8h72m-97 27 6 6 11-13m8 8h55m-80 27 6 6 11-13m8 8h61" stroke="#548E63" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M160 184v-26h13v26m9 0v-43h13v43m9 0v-61h13v61" fill="#E97855" stroke="#38463B" strokeWidth="3" strokeLinejoin="round" />
        <path d="m185 82 35-33 12 12-35 33-17 5 5-17Z" fill="#F5C45A" stroke="#38463B" strokeWidth="4" strokeLinejoin="round" />
        <path d="m211 58 12 12" stroke="#38463B" strokeWidth="3" />
      </>
    ),
    behavior: (
      <>
        <circle cx="205" cy="47" r="24" fill="#FFC85B" />
        <path d="M69 188c4-48 18-76 48-91m-46 60c-22-17-40-14-47 8 19 16 35 12 47-8Zm14-27c4-24 18-34 37-29 2 20-10 31-37 29Zm70 63c1-32 10-54 32-68m-27 45c-16-13-29-11-35 7 15 13 26 10 35-7Zm15-22c3-19 14-27 29-23 1 16-8 24-29 23Z" stroke="#548E63" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M54 196h151" stroke="#38463B" strokeWidth="5" strokeLinecap="round" />
        <path d="M131 68c-20-22-50 7 0 43 50-36 20-65 0-43Z" fill="#E97855" stroke="#38463B" strokeWidth="4" strokeLinejoin="round" />
        <path d="m230 106 4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1 4-8Z" fill="#E97855" />
      </>
    ),
  }[kind];

  return (
    <svg
      aria-hidden="true"
      className={`welcome-art section-illustration illustration-${kind}`}
      fill="none"
      viewBox="0 0 270 230"
    >
      <path d="M18 199c28-23 54-23 82 0 26-21 56-23 84-1 23-17 46-19 68-2v22H18v-19Z" fill="#DDEBD6" />
      {illustration}
    </svg>
  );
}
