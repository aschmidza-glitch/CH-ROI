import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Bed,
  PoundSterling,
  CalendarRange,
  Activity,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";

/*
  Whzan Care Home P&L ROI Calculator
  Scope: the care home's OWN gross retained revenue, before margin. Not NHS / system savings.
  Evidence base: Health Foundation IAU 2019; Forder & Fernandez 2011; AHSN NENC / HealthCall / Sefton CHIP.
  All defaults labelled inline with source and a reliability flag.
*/

// ---------- Brand ----------
const C = {
  primary: "#0046A5",
  primary2: "#2650F4",
  blue: "#0366E7",
  blue2: "#0082FA",
  blue3: "#00AAFF",
  sky: "#A5DAFF",
  purple: "#A259FF",
  light: "#F3F3F3",
  amber: "#F59E0B",
  ink: "#13233B",
  slate: "#5A6B82",
  line: "#E3E9F2",
  white: "#FFFFFF",
};

// ---------- Helpers ----------
const gbp0 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
const gbp2 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});
const num1 = (n) => (Math.round(n * 10) / 10).toLocaleString("en-GB");
const num2 = (n) => (Math.round(n * 100) / 100).toLocaleString("en-GB");

function Flag({ kind }) {
  const map = {
    green: { dot: "#1FAE67", label: "Robust" },
    amber: { dot: C.amber, label: "Moderate" },
    red: { dot: "#E0594B", label: "Weak" },
  };
  const m = map[kind] || map.amber;
  return (
    <span
      title={m.label + " evidence"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: C.slate,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 8,
          background: m.dot,
          display: "inline-block",
        }}
      />
      {m.label}
    </span>
  );
}

const card = {
  background: C.white,
  borderRadius: 16,
  border: `1px solid ${C.line}`,
  boxShadow: "0 1px 2px rgba(19,35,59,0.04)",
  padding: 20,
};

function Field({ label, source, flag, children, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <label style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
          {label}
        </label>
        {flag ? <Flag kind={flag} /> : null}
      </div>
      {children}
      {source ? (
        <div style={{ fontSize: 11, color: C.slate, marginTop: 5, lineHeight: 1.45 }}>
          {source}
        </div>
      ) : null}
      {hint ? (
        <div style={{ fontSize: 11, color: C.purple, marginTop: 4, fontWeight: 600 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  borderRadius: 10,
  border: `1px solid ${C.line}`,
  fontSize: 15,
  color: C.ink,
  fontWeight: 600,
  outline: "none",
  background: "#FBFCFE",
};

function NumberInput({ value, onChange, min, max, step, prefix, suffix }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {prefix ? (
        <span style={{ position: "absolute", left: 11, color: C.slate, fontSize: 14, fontWeight: 700 }}>
          {prefix}
        </span>
      ) : null}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        style={{
          ...inputStyle,
          paddingLeft: prefix ? 24 : 11,
          paddingRight: suffix ? 34 : 11,
        }}
      />
      {suffix ? (
        <span style={{ position: "absolute", right: 11, color: C.slate, fontSize: 13, fontWeight: 700 }}>
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        background: C.light,
        padding: 4,
        borderRadius: 12,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              border: "none",
              cursor: "pointer",
              borderRadius: 9,
              padding: "8px 6px",
              fontSize: 12.5,
              fontWeight: 700,
              color: active ? C.white : C.slate,
              background: active ? C.primary : "transparent",
              transition: "all .15s",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Core calculation ----------
function simWindowWeeks(lossesPerYear, tenureWeeks, horizonYears) {
  // Aggregated within-horizon retained resident-weeks across ALL avoided losses,
  // assuming losses arise uniformly month by month and each retains up to `tenureWeeks`,
  // capped at the weeks remaining inside the contract window.
  const horizonWeeks = horizonYears * 52;
  const months = Math.max(1, Math.round(horizonYears * 12));
  const lossesPerMonth = lossesPerYear / 12;
  const wpm = 52 / 12;
  let total = 0;
  for (let i = 0; i < months; i++) {
    const eventWeek = (i + 0.5) * wpm;
    const left = horizonWeeks - eventWeek;
    total += lossesPerMonth * Math.min(tenureWeeks, Math.max(0, left));
  }
  return total;
}

function computeScenario(p, effect, tenureWeeks) {
  const occupiedBeds = p.beds * (p.occupancy / 100);
  const admissionsPerYear = occupiedBeds * p.admissionRate;
  const avoidableCeilingPerYear = admissionsPerYear * 0.41;
  const admissionsAvoidedPerYear = admissionsPerYear * effect;
  const lossesPerYear = admissionsAvoidedPerYear * (p.tenancyLossRate / 100);
  const lossesOverHorizon = lossesPerYear * p.horizonYears;

  const windowWeeksAll = simWindowWeeks(lossesPerYear, tenureWeeks, p.horizonYears);
  const ltvWeeksAll = lossesOverHorizon * tenureWeeks;

  // Lever 1: premature-loss avoidance (retained residents valued at the weekly fee for their tenure)
  const lever1Window = windowWeeksAll * p.fee;
  const lever1Ltv = ltvWeeksAll * p.fee;

  const retainedWindow = lever1Window;
  const retainedLtv = lever1Ltv;

  return {
    occupiedBeds,
    admissionsPerYear,
    avoidableCeilingPerYear,
    admissionsAvoidedPerYear,
    admissionsAvoidedHorizon: admissionsAvoidedPerYear * p.horizonYears,
    lossesPerYear,
    lossesOverHorizon,
    lever1Window,
    lever1Ltv,
    retainedWindow,
    retainedLtv,
    windowWeeksAll,
    ltvWeeksAll,
  };
}

export default function CareHomeROICalculator() {
  // BDM headline inputs
  const [beds, setBeds] = useState(50);
  const [occupancy, setOccupancy] = useState(87);
  const [fee, setFee] = useState(1300);
  const [careType, setCareType] = useState("blended"); // blended | residential | nursing
  const [horizonYears, setHorizonYears] = useState(2);
  const [scenario, setScenario] = useState("central"); // conservative | central | optimistic

  // Whzan pricing
  const autoPrice = beds >= 600 ? 4.0 : 5.0;
  const [priceOverride, setPriceOverride] = useState(null);
  const pricePerBed = priceOverride === null || priceOverride === "" ? autoPrice : priceOverride;

  // Advanced assumptions
  const [showAdv, setShowAdv] = useState(false);
  const [tenancyLossRate, setTenancyLossRate] = useState(12); // %  (12% = in-hospital death floor)
  const [carerHours, setCarerHours] = useState(6);
  const [loadedRate, setLoadedRate] = useState(16);
  const [optimisticEffect, setOptimisticEffect] = useState(45); // % (40-53 band)
  const [tenureLow, setTenureLow] = useState(52);
  const [tenureCentral, setTenureCentral] = useState(65);
  const [tenureHigh, setTenureHigh] = useState(90);

  const admissionRate =
    careType === "residential" ? 0.77 : careType === "nursing" ? 0.63 : 0.7;

  const effectValues = {
    conservative: 0.15,
    central: 0.22,
    optimistic: optimisticEffect / 100,
  };
  const selectedEffect = effectValues[scenario];
  const bandHighEffect = scenario === "optimistic" ? optimisticEffect / 100 : 0.25;

  const p = {
    beds: Number(beds) || 0,
    occupancy: Number(occupancy) || 0,
    fee: Number(fee) || 0,
    admissionRate,
    tenancyLossRate: Number(tenancyLossRate) || 0,
    horizonYears: Number(horizonYears) || 0,
  };

  const r = useMemo(() => computeScenario(p, selectedEffect, Number(tenureCentral)), [
    p.beds,
    p.occupancy,
    p.fee,
    p.admissionRate,
    p.tenancyLossRate,
    p.horizonYears,
    selectedEffect,
    tenureCentral,
  ]);

  // Whzan cost
  const monthlyWhzanRaw = p.beds * pricePerBed;
  const monthlyWhzan = Math.max(monthlyWhzanRaw, 99);
  const minApplied = monthlyWhzanRaw < 99;
  const whzanCost = monthlyWhzan * p.horizonYears * 12;

  // Lever 2 staff time (operational saving, shown separately from gross revenue)
  const staffHours = r.admissionsAvoidedHorizon * (Number(carerHours) || 0);
  const staffValue = staffHours * (Number(loadedRate) || 0);

  // Headline = within-24-month window basis
  const retainedHeadline = r.retainedWindow;
  const netBenefit = retainedHeadline - whzanCost;
  const roi = whzanCost > 0 ? retainedHeadline / whzanCost : 0;
  const months = Math.max(1, Math.round(p.horizonYears * 12));
  const monthlyRunRate = retainedHeadline / months;
  const paybackMonths = monthlyRunRate > 0 ? whzanCost / monthlyRunRate : null;

  // Sensitivity band (window basis)
  const band = useMemo(() => {
    const low = computeScenario(p, 0.15, Number(tenureLow)).retainedWindow;
    const central = computeScenario(p, selectedEffect, Number(tenureCentral)).retainedWindow;
    const high = computeScenario(p, bandHighEffect, Number(tenureHigh)).retainedWindow;
    return [
      { name: "Low", detail: "15% effect / " + tenureLow + " wk", value: low, color: C.sky },
      { name: "Central", detail: Math.round(selectedEffect * 100) + "% effect / " + tenureCentral + " wk", value: central, color: C.blue },
      { name: "High", detail: Math.round(bandHighEffect * 100) + "% effect / " + tenureHigh + " wk", value: high, color: C.primary },
    ];
  }, [p.beds, p.occupancy, p.fee, p.admissionRate, p.tenancyLossRate, p.horizonYears, selectedEffect, bandHighEffect, tenureLow, tenureCentral, tenureHigh]);

  // Illustrative clinical activity (context only, does NOT feed the price/ROI).
  // A&E and admission rates: Health Foundation IAU 2019, Table 2. Ambulance: Hancock 2017 (separate, older).
  const aeRate = careType === "residential" ? 1.12 : careType === "nursing" ? 0.85 : 0.98;
  const aeAdmitPct = careType === "residential" ? 60 : careType === "nursing" ? 65 : 62;
  const ambulanceRate = 0.51;
  const aeAttendancesYr = r.occupiedBeds * aeRate;
  const ambulanceYr = r.occupiedBeds * ambulanceRate;
  const activityData = [
    { name: "A&E attendances", value: Math.round(aeAttendancesYr * 10) / 10, color: C.blue3 },
    { name: "Emergency admissions", value: Math.round(r.admissionsPerYear * 10) / 10, color: C.blue },
    { name: "Ambulance call-outs", value: Math.round(ambulanceYr * 10) / 10, color: C.purple },
  ];

  // ---------- UI ----------
  return (
    <div
      style={{
        fontFamily:
          "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        background: C.light,
        color: C.ink,
        minHeight: "100%",
        padding: 0,
      }}
    >
      {/* Masthead */}
      <div
        style={{
          background: `linear-gradient(120deg, ${C.primary} 0%, ${C.primary2} 70%, ${C.blue} 100%)`,
          color: C.white,
          padding: "26px 28px",
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: 2, opacity: 0.85, fontWeight: 700 }}>
          WHZAN BLUE BOX
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, lineHeight: 1.15 }}>
          Care Home P&amp;L ROI Calculator
        </div>
        <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 8, maxWidth: 760, lineHeight: 1.5 }}>
          The care home&rsquo;s own gross retained revenue, before margin. This is not NHS or
          system savings. Profit impact exceeds gross revenue because of the home&rsquo;s high
          fixed-cost base (operating leverage): once core staffing and overheads are covered, a
          retained or refilled bed largely drops through to operating profit.
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 380px) 1fr", gap: 20, alignItems: "start" }}>
          {/* LEFT: inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={card}>
              <SectionTitle icon={<Bed size={16} />} text="Home details" />
              <Field label="Number of beds (registered)">
                <NumberInput value={beds} onChange={setBeds} min={1} step={1} />
              </Field>
              <Field
                label="Occupancy"
                flag="green"
                source="Sector norm 86 to 88% (Knight Frank 2024 occupancy 88%; DHSC Capacity Tracker ~86%). Anchored here, not 100%."
              >
                <NumberInput value={occupancy} onChange={setOccupancy} min={1} max={100} step={1} suffix="%" />
              </Field>
              <Field label="Home&rsquo;s own weekly fee per bed" source="Enter the home&rsquo;s actual fee, not a funder average.">
                <NumberInput value={fee} onChange={setFee} min={0} step={10} prefix="£" />
              </Field>
              <Field label="Care type (sets base admission rate)" flag="green" source="Health Foundation IAU 2019: 0.70 blended, 0.77 residential, 0.63 nursing emergency admissions per resident/year.">
                <Seg
                  options={[
                    { value: "blended", label: "Blended 0.70" },
                    { value: "residential", label: "Resi 0.77" },
                    { value: "nursing", label: "Nursing 0.63" },
                  ]}
                  value={careType}
                  onChange={setCareType}
                />
              </Field>
            </div>

            <div style={card}>
              <SectionTitle icon={<PoundSterling size={16} />} text="Whzan pricing & term" />
              <Field
                label="Whzan price per bed / month"
                source={
                  "Confirmed: £5.00/bed/month, £4.00/bed at 600+ beds (volume rate applies to the whole account). £99 site minimum. 24-month minimum term. Auto rate for this account: £" +
                  autoPrice.toFixed(2) +
                  ". Editable for group/account deals."
                }
              >
                <NumberInput
                  value={priceOverride === null ? autoPrice : priceOverride}
                  onChange={(v) => setPriceOverride(v)}
                  min={0}
                  step={0.5}
                  prefix="£"
                />
              </Field>
              <Field label="Contract horizon">
                <NumberInput value={horizonYears} onChange={setHorizonYears} min={1} max={5} step={1} suffix="years" />
              </Field>
              <div
                style={{
                  background: C.light,
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 12.5,
                  color: C.slate,
                  lineHeight: 1.5,
                }}
              >
                Whzan cost: {gbp0.format(monthlyWhzan)} / month {minApplied ? "(£99 site minimum applied)" : ""} ={" "}
                <strong style={{ color: C.ink }}>{gbp0.format(whzanCost)}</strong> over {months} months.
              </div>
            </div>

            <div style={card}>
              <SectionTitle icon={<Activity size={16} />} text="Effect-size scenario" />
              <Field
                label="Reduction in emergency admissions"
                flag="amber"
                source="Conservative 15% (Sefton CHIP). Central band 19 to 25%; 22% AHSN NENC Blue Box anchor, HealthCall 25%. Optimistic 40 to 53% is Whzan single-site, vendor/pre-post."
              >
                <Seg
                  options={[
                    { value: "conservative", label: "Cons 15%" },
                    { value: "central", label: "Central 22%" },
                    { value: "optimistic", label: "Opt " + optimisticEffect + "%" },
                  ]}
                  value={scenario}
                  onChange={setScenario}
                />
              </Field>
              {scenario === "optimistic" ? (
                <div
                  style={{
                    background: "#FFF4E5",
                    border: `1px solid ${C.amber}`,
                    borderRadius: 10,
                    padding: "9px 12px",
                    fontSize: 12,
                    color: "#9A5B00",
                    fontWeight: 600,
                    lineHeight: 1.45,
                  }}
                >
                  Optimistic is a single-home, pre/post, summer-vs-winter comparison (weak evidence). Use
                  deliberately and flag it to the client.
                </div>
              ) : null}
            </div>

            {/* Advanced */}
            <div style={card}>
            <button
              onClick={() => setShowAdv((s) => !s)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                color: C.primary,
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              {showAdv ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              Advanced assumptions
            </button>
            {showAdv ? (
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0 28px" }}>
                <div>
                  <Field
                    label="Tenancy loss on admission"
                    flag="green"
                    source="12% lower bound = in-hospital death (IAU 2019). Adjust upward to add the onward-discharge increment (resident discharged to a different/higher-care setting)."
                    hint="UK data gap: only the 12% in-hospital-death share is firmly sourced. The onward-discharge increment is an assumption."
                  >
                    <NumberInput value={tenancyLossRate} onChange={setTenancyLossRate} min={0} max={40} step={1} suffix="%" />
                  </Field>
                  <Field
                    label="Average remaining tenure (Low / Central / High)"
                    flag="amber"
                    source="Forder & Fernandez 2011 median 65 wk central; 52 wk low (recent, nursing-weighted); 90 wk high (mean-based, residential). Old 114-wk figure retired."
                    hint="Residents facing an acute admission are frailer than average, so their true remaining tenure may sit nearer the 52-week floor."
                  >
                    <div style={{ display: "flex", gap: 8 }}>
                      <NumberInput value={tenureLow} onChange={setTenureLow} min={1} step={1} suffix="wk" />
                      <NumberInput value={tenureCentral} onChange={setTenureCentral} min={1} step={1} suffix="wk" />
                      <NumberInput value={tenureHigh} onChange={setTenureHigh} min={1} step={1} suffix="wk" />
                    </div>
                  </Field>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 10 }}>
                    Effect size
                  </div>
                  <Field
                    label="Optimistic effect-size value (40 to 53% band)"
                    flag="red"
                  >
                    <NumberInput value={optimisticEffect} onChange={setOptimisticEffect} min={40} max={53} step={1} suffix="%" />
                  </Field>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 10 }}>
                    Lever 2 (staff time recovered)
                  </div>
                  <Field
                    label="Carer hours recovered per avoided admission"
                    source="Operational assumption (escalation, ambulance wait, handover, hospital liaison, discharge and readmission admin). Not from the research reports."
                  >
                    <NumberInput value={carerHours} onChange={setCarerHours} min={0} step={1} suffix="hrs" />
                  </Field>
                  <Field
                    label="Loaded carer rate"
                    source="April 2026 National Living Wage plus on-costs."
                  >
                    <NumberInput value={loadedRate} onChange={setLoadedRate} min={0} step={0.5} prefix="£" suffix="/hr" />
                  </Field>
                </div>
              </div>
            ) : null}
          </div>
          </div>

          {/* RIGHT: results */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Hero */}
            <div style={{ ...card, padding: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.slate, marginBottom: 14 }}>
                Results over {months} months
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                <HeroStat
                  label="Gross retained revenue"
                  value={gbp0.format(retainedHeadline)}
                  sub="Headline, within-window basis"
                  accent={C.purple}
                />
                <HeroStat
                  label="Lifetime value protected"
                  value={gbp0.format(r.retainedLtv)}
                  sub="Full tenure, some beyond the contract"
                  accent={C.blue}
                />
                <HeroStat
                  label="Return on Whzan cost"
                  value={num1(roi) + "\u00D7"}
                  sub={"Net " + gbp0.format(netBenefit) + ", payback ~" + (paybackMonths ? num1(paybackMonths) : "n/a") + " mo"}
                  accent={C.primary}
                />
              </div>
            </div>


            {/* Lever cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <LeverCard
                tag="Lever 1"
                title="Premature-loss avoidance"
                value={gbp0.format(r.lever1Window)}
                accent={C.blue}
                rows={[
                  ["Within-window (headline)", gbp0.format(r.lever1Window)],
                  ["Lifetime value (LTV)", gbp0.format(r.lever1Ltv)],
                  ["Premature losses avoided", num2(r.lossesOverHorizon) + " over " + months + " mo"],
                ]}
                note="Retained residents who would otherwise be permanently lost, valued at the weekly fee for their remaining tenure."
              />
              <LeverCard
                tag="Lever 2"
                title="Staff time recovered"
                value={gbp0.format(staffValue)}
                accent={C.blue2}
                rows={[
                  ["Carer hours saved", num1(staffHours) + " hrs"],
                  ["Avoided admissions", num1(r.admissionsAvoidedHorizon) + " over " + months + " mo"],
                  ["Loaded rate", gbp2.format(loadedRate) + "/hr"],
                ]}
                note="Operational saving from fewer escalations and hospital liaison. Shown separately from gross revenue, not added to the headline."
              />
            </div>

            {/* Sensitivity */}
            <div style={card}>
              <SectionTitle icon={<Activity size={16} />} text="Sensitivity range (no single hero number)" />
              <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>
                Effect size 15 to 25% and remaining tenure 52 / 65 / 90 weeks. Headline retained revenue, within-window basis.
              </div>
              <div style={{ height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={band} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                    <CartesianGrid stroke={C.line} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: C.ink, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: C.line }} />
                    <YAxis tick={{ fontSize: 11, fill: C.slate }} tickLine={false} axisLine={false} tickFormatter={(v) => "£" + Math.round(v / 1000) + "k"} />
                    <Tooltip formatter={(v, n, o) => [gbp0.format(v), o && o.payload ? o.payload.detail : ""]} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {band.map((b, i) => (
                        <Cell key={i} fill={b.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Admission chain */}
            <div style={card}>
              <SectionTitle icon={<Info size={16} />} text="Admission chain (per year, central case)" />
              <ChainRow label={"Occupied beds (" + num1(p.beds) + " beds x " + num1(p.occupancy) + "%)"} value={num1(r.occupiedBeds)} />
              <ChainRow label={"Emergency admissions (x " + num2(p.admissionRate) + "/resident/yr)"} value={num1(r.admissionsPerYear)} />
              <ChainRow label="Avoidable ceiling (x 41%, sense-check only)" value={num1(r.avoidableCeilingPerYear)} muted />
              <ChainRow label={"Admissions avoided (x " + Math.round(selectedEffect * 100) + "% effect)"} value={num1(r.admissionsAvoidedPerYear)} highlight />
              <ChainRow label={"Premature losses avoided (x " + num1(p.tenancyLossRate) + "% tenancy loss)"} value={num2(r.lossesPerYear)} highlight />
              <div style={{ fontSize: 11.5, color: C.slate, marginTop: 8, lineHeight: 1.5 }}>
                Avoided admissions ({num1(r.admissionsAvoidedPerYear)}/yr) sit well inside the avoidable ceiling
                ({num1(r.avoidableCeilingPerYear)}/yr), so the effect size is not over-claiming. The 41% is a credibility
                check only, it is not multiplied into the chain (no double-counting).
              </div>
            </div>

            {/* Illustrative clinical activity (context only, does not affect price) */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                <SectionTitle icon={<Activity size={16} />} text="Illustrative clinical activity (per year)" />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: C.slate,
                    background: C.light,
                    padding: "4px 10px",
                    borderRadius: 999,
                  }}
                >
                  Context only, does not affect the ROI
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 14, lineHeight: 1.5 }}>
                Baseline hospital activity for this home, scaled to your beds, occupancy and care type. These figures
                are illustrative context for the conversation; the retained revenue and ROI above are driven solely by
                Lever 1 and are not affected by anything here.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
                <ActivityTile color={C.blue3} value={num1(aeAttendancesYr)} label={"A&E attendances / yr (x " + aeRate.toFixed(2) + ")"} />
                <ActivityTile color={C.blue} value={num1(r.admissionsPerYear)} label={"Emergency admissions / yr (x " + num2(p.admissionRate) + ")"} />
                <ActivityTile color={C.purple} value={num1(ambulanceYr)} label={"Ambulance call-outs / yr (x " + ambulanceRate.toFixed(2) + ")"} />
              </div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                    <CartesianGrid stroke={C.line} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11.5, fill: C.ink, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: C.line }} />
                    <YAxis tick={{ fontSize: 11, fill: C.slate }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => [num1(v) + " / yr", ""]} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {activityData.map((a, i) => (
                        <Cell key={i} fill={a.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontSize: 11.5, color: C.slate, marginTop: 10, lineHeight: 1.5 }}>
                A&E attendances and emergency admissions sit close together because about {aeAdmitPct}% of A&E attendances
                from {careType === "blended" ? "care" : careType} homes result in an admission (IAU 2019), and some
                admissions arrive without an A&E visit. Residential homes run higher on both measures than nursing
                (1.12 vs 0.85 A&E; 0.77 vs 0.63 admissions). <Flag kind="green" /> A&E and admissions: IAU 2019, Table 2.
                {" "}<Flag kind="amber" /> Ambulance call-outs: Hancock 2017 (0.51/resident/yr), a separate, older blended
                figure, not from the IAU report and not split by care type.
              </div>
            </div>

            <div style={card}>
              <SectionTitle icon={<CalendarRange size={16} />} text="Cost & position" />
              <SummaryRow label="Whzan cost" value={gbp0.format(whzanCost)} />
              <SummaryRow label="Gross retained revenue (Lever 1)" value={gbp0.format(retainedHeadline)} strong color={C.purple} />
              <SummaryRow label="Net revenue benefit" value={gbp0.format(netBenefit)} strong color={C.primary} />
              <SummaryRow label="Staff time recovered (Lever 2, additional)" value={gbp0.format(staffValue)} />
            </div>

            {/* Footnotes */}
            <div style={{ ...card, background: "#FBFCFE" }}>
              <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.6 }}>
                <strong style={{ color: C.ink }}>Why profit beats this number:</strong> the figure above is gross retained
                revenue. Because the home carries a high fixed-cost base (rent/finance, core rostered staffing, utilities,
                registration), a retained or refilled bed sheds only marginal variable cost, so the operating-profit impact
                is disproportionately larger than the gross revenue shown.
                <br />
                <br />
                <strong style={{ color: C.ink }}>Evidence base:</strong> Health Foundation IAU 2019 (admission rate 0.70,
                avoidable 41%, in-hospital death 12%); Forder &amp; Fernandez 2011 (tenure median 65 weeks); AHSN NENC Blue
                Box / HealthCall / Sefton CHIP (effect size). Effect sizes are direction-credible but magnitude-uncertain
                (no UK RCT exists). Defaults are deliberately conservative.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Small components ----------
function SectionTitle({ icon, text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: C.light,
          color: C.primary,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{text}</span>
    </div>
  );
}

function LeverCard({ tag, title, value, accent, rows, note }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: C.white,
            background: accent,
            padding: "3px 8px",
            borderRadius: 6,
          }}
        >
          {tag}
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{title}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: accent, marginBottom: 10 }}>{value}</div>
      {rows.map((rw, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12.5,
            padding: "5px 0",
            borderTop: i === 0 ? `1px solid ${C.line}` : "none",
            color: C.slate,
          }}
        >
          <span>{rw[0]}</span>
          <strong style={{ color: C.ink }}>{rw[1]}</strong>
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 10, lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

function ChainRow({ label, value, highlight, muted }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 10px",
        borderRadius: 8,
        background: highlight ? "rgba(38,80,244,0.06)" : "transparent",
        marginBottom: 4,
      }}
    >
      <span style={{ fontSize: 13, color: muted ? C.slate : C.ink, fontStyle: muted ? "italic" : "normal" }}>{label}</span>
      <strong style={{ fontSize: 15, color: highlight ? C.primary : muted ? C.slate : C.ink }}>{value}</strong>
    </div>
  );
}

function HeroStat({ label, value, sub, accent, valueSize }) {
  return (
    <div style={{ background: C.light, borderRadius: 14, padding: 16 }}>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 800,
          letterSpacing: 0.3,
          color: C.slate,
          textTransform: "uppercase",
          minHeight: 30,
          lineHeight: 1.25,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: valueSize || 30, fontWeight: 800, color: accent, lineHeight: 1.08, marginTop: 6 }}>
        {value}
      </div>
      {sub ? (
        <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6, lineHeight: 1.4 }}>{sub}</div>
      ) : null}
    </div>
  );
}

function ActivityTile({ color, value, label }) {
  return (
    <div style={{ background: C.light, borderRadius: 12, padding: "12px 14px", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 2, lineHeight: 1.35 }}>{label}</div>
    </div>
  );
}

function SummaryRow({ label, value, strong, color }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "7px 0",
        borderBottom: `1px solid ${C.line}`,
        fontSize: 13.5,
      }}
    >
      <span style={{ color: C.slate, fontWeight: strong ? 700 : 500 }}>{label}</span>
      <strong style={{ color: color || C.ink, fontWeight: 800 }}>{value}</strong>
    </div>
  );
}
