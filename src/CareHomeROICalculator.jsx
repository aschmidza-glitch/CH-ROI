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
  Headline basis: VOID-CYCLE. Each prevented premature permanent loss saves one bed-refill cycle,
  valued as (void weeks x weekly fee) + average refill cost. In a market running ~85-91% occupancy
  the bed refills, so the true incremental loss is the void gap plus refill cost, NOT the resident's
  full remaining tenure. Full-tenure value is retained only as a labelled upper bound for a
  demand-constrained home that genuinely cannot refill.
  Evidence base: Health Foundation IAU 2019 (admissions); Knight Frank 2024 (occupancy, length of stay);
  LaingBuisson 2024/25 (fees); AHSN NENC / HealthCall / Sefton CHIP (effect size);
  Forder & Fernandez 2011 (remaining tenure, upper bound only).
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
function computeScenario(p, effect, voidWeeks, refillCost) {
  const occupiedBeds = p.beds * (p.occupancy / 100);
  const admissionsPerYear = occupiedBeds * p.admissionRate;
  const admissionsAvoidedPerYear = admissionsPerYear * effect;
  const lossesPerYear = admissionsAvoidedPerYear * (p.tenancyLossRate / 100);
  const lossesOverHorizon = lossesPerYear * p.horizonYears;

  // HEADLINE: void-cycle basis. Each prevented permanent loss saves one refill cycle:
  // lost fee income while the bed is empty, plus the average cost of refilling it.
  const lostIncomePerLoss = voidWeeks * p.fee;
  const perLossValue = lostIncomePerLoss + refillCost;
  const lostIncomeTotal = lossesOverHorizon * lostIncomePerLoss;
  const refillTotal = lossesOverHorizon * refillCost;
  const retainedWindow = lossesOverHorizon * perLossValue;

  return {
    occupiedBeds,
    admissionsPerYear,
    admissionsAvoidedPerYear,
    admissionsAvoidedHorizon: admissionsAvoidedPerYear * p.horizonYears,
    lossesPerYear,
    lossesOverHorizon,
    lostIncomePerLoss,
    perLossValue,
    lostIncomeTotal,
    refillTotal,
    retainedWindow,
  };
}

// ---------- Sector reference data ----------
// Occupancy: Knight Frank UK Care Homes Trading Performance Review 2024.
// Fees: LaingBuisson Care Homes for Older People 2024/25 / Knight Frank 2024.
// Length of stay: Knight Frank 2024 (private ~26 months, local authority ~30 months).
const SECTOR = {
  private: {
    label: "Private Care",
    losMonths: 26,
    residential: { occ: 85.0, fee: 1278 },
    nursing: { occ: 85.3, fee: 1594 },
    blended: { occ: 85.2, fee: 1427 },
  },
  la: {
    label: "Local Authority",
    losMonths: 30,
    residential: { occ: 90.6, fee: 908 },
    nursing: { occ: 91.5, fee: 1225 },
    blended: { occ: 91.0, fee: 985 },
  },
};

export default function CareHomeROICalculator() {
  // BDM headline inputs
  const [beds, setBeds] = useState(50);
  const [funding, setFunding] = useState("private"); // private | la
  const [careType, setCareType] = useState("blended"); // blended | residential | nursing
  const [occupancy, setOccupancy] = useState(SECTOR.private.blended.occ);
  const [fee, setFee] = useState(SECTOR.private.blended.fee);
  const [horizonYears, setHorizonYears] = useState(2);

  // Bed-refill economics (research: void 4-8 wk, default 6; refill cost £1,000-3,000, default £1,500)
  const [voidWeeks, setVoidWeeks] = useState(6);
  const [refillCost, setRefillCost] = useState(1500);
  const [loadedRate, setLoadedRate] = useState(16);

  // Selecting a sector or care type repopulates occupancy and fee with the sector default (still editable).
  const applySector = (f, ct) => {
    const s = SECTOR[f][ct];
    setOccupancy(s.occ);
    setFee(s.fee);
  };
  const onFunding = (v) => {
    setFunding(v);
    applySector(v, careType);
  };
  const onCareType = (v) => {
    setCareType(v);
    applySector(funding, v);
  };
  const losMonths = SECTOR[funding].losMonths;

  // Whzan pricing (locked: £5.00/bed/month, £4.50 at 500+ beds)
  const pricePerBed = beds >= 500 ? 4.5 : 5.0;

  // Retained assumptions (not user-editable in this build; data preserved)
  const tenancyLossRate = 20; // % total placement loss (12% in-hospital death + ~8pp survivor non-return)
  const carerHours = 6; // carer hours recovered per avoided admission

  const admissionRate =
    careType === "residential" ? 0.77 : careType === "nursing" ? 0.63 : 0.7;

  // Effect size locked at the central 22% (AHSN NENC Blue Box anchor)
  const selectedEffect = 0.22;

  const p = {
    beds: Number(beds) || 0,
    occupancy: Number(occupancy) || 0,
    fee: Number(fee) || 0,
    admissionRate,
    tenancyLossRate: Number(tenancyLossRate) || 0,
    horizonYears: Number(horizonYears) || 0,
  };

  const r = useMemo(() => computeScenario(p, selectedEffect, Number(voidWeeks), Number(refillCost)), [
    p.beds,
    p.occupancy,
    p.fee,
    p.admissionRate,
    p.tenancyLossRate,
    p.horizonYears,
    selectedEffect,
    voidWeeks,
    refillCost,
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

  // Illustrative clinical activity (context only, does NOT feed the price/ROI).
  // A&E and admission rates: Health Foundation IAU 2019, Table 2.
  const aeRate = careType === "residential" ? 1.12 : careType === "nursing" ? 0.85 : 0.98;
  const aeAdmitPct = careType === "residential" ? 60 : careType === "nursing" ? 65 : 62;
  const aeAttendancesYr = r.occupiedBeds * aeRate;
  const activityData = [
    { name: "A&E attendances", value: Math.round(aeAttendancesYr * 10) / 10, color: C.blue3 },
    { name: "Emergency admissions", value: Math.round(r.admissionsPerYear * 10) / 10, color: C.blue },
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
        <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 8, maxWidth: 780, lineHeight: 1.5 }}>
          The care home&rsquo;s own gross retained revenue, before margin (not NHS savings). Each prevented
          permanent loss is valued as one bed-refill cycle: lost fee income while the bed is empty, plus the
          refill cost. With mostly fixed costs, the profit impact exceeds the gross figure.
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 380px) 1fr", gap: 20, alignItems: "start" }}>
          {/* LEFT: inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={card}>
              <SectionTitle icon={<Bed size={16} />} text="Care home group details" />
              <Field label="Number of beds (registered)">
                <NumberInput value={beds} onChange={setBeds} min={1} step={1} />
              </Field>
              <Field
                label="Funding type (sets sector occupancy & fee)"
                flag="green"
                source="Knight Frank 2024 occupancy: private 85.2%, LA 91.0%. Pre-fills occupancy and fee (editable)."
              >
                <Seg
                  options={[
                    { value: "private", label: "Private Care" },
                    { value: "la", label: "Local Authority" },
                  ]}
                  value={funding}
                  onChange={onFunding}
                />
              </Field>
              <Field label="Care type (sets admission rate, occupancy & fee)" flag="green" source="IAU 2019 admissions/resident/yr: 0.70 blended, 0.77 residential, 0.63 nursing. Residential ~22% above nursing, carried through the ROI.">
                <Seg
                  options={[
                    { value: "blended", label: "Blended 0.70" },
                    { value: "residential", label: "Resi 0.77" },
                    { value: "nursing", label: "Nursing 0.63" },
                  ]}
                  value={careType}
                  onChange={onCareType}
                />
              </Field>
              <Field
                label="Occupancy"
                flag="green"
                source={"Sector default for " + SECTOR[funding].label + " " + careType + ": pre-filled, editable. Knight Frank 2024."}
              >
                <NumberInput value={occupancy} onChange={setOccupancy} min={1} max={100} step={0.1} suffix="%" />
              </Field>
              <Field
                label="Home&rsquo;s own weekly fee per bed"
                source="Pre-filled from LaingBuisson / Knight Frank 2024/25 sector average. Replace with the home&rsquo;s actual fee where known."
              >
                <NumberInput value={fee} onChange={setFee} min={0} step={10} prefix="£" />
              </Field>
              <Field
                label="Void period (weeks empty before re-let)"
                flag="amber"
                source="Triangulated re-let gap 4 to 8 weeks (TrustedCare 2023; occupancy and length-of-stay maths). No direct UK void-days figure exists."
              >
                <NumberInput value={voidWeeks} onChange={setVoidWeeks} min={4} max={8} step={1} suffix="wk" />
              </Field>
              <Field
                label="Refill cost per re-let"
                flag="amber"
                source="Average marketing, admissions and assessment time, plus room turnaround. Research range £1,000 to £3,000; default £1,500."
              >
                <NumberInput value={refillCost} onChange={setRefillCost} min={0} step={100} prefix="£" />
              </Field>
              <Field
                label="Loaded carer rate"
                source="April 2026 National Living Wage plus on-costs."
              >
                <NumberInput value={loadedRate} onChange={setLoadedRate} min={0} step={0.5} prefix="£" suffix="/hr" />
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
                Loss avoided per prevented permanent loss ={" "}
                <strong style={{ color: C.ink }}>{gbp0.format(r.perLossValue)}</strong>{" "}
                ({voidWeeks} wk x {gbp0.format(fee)} + {gbp0.format(refillCost)} refill). Average length of
                stay for {SECTOR[funding].label}: ~{losMonths} months (Knight Frank 2024), context for turnover frequency.
              </div>
            </div>

            <div style={card}>
              <SectionTitle icon={<PoundSterling size={16} />} text="Whzan pricing & term" />
              <Field
                label="Whzan price per bed / month"
                source="Locked: £5.00/bed/month, £4.50 at 500+ beds. £99 site minimum. 24-month minimum term."
              >
                <div
                  style={{
                    ...inputStyle,
                    background: C.light,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "default",
                  }}
                >
                  <span>{gbp2.format(pricePerBed)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.slate }}>
                    {beds >= 500 ? "500+ rate" : "standard rate"}
                  </span>
                </div>
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
              <SectionTitle icon={<Activity size={16} />} text="Effect size locked at 22%" />
              <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.5 }}>
                Reduction in emergency admissions fixed at the central 22% (AHSN NENC Blue Box anchor; HealthCall 25%,
                Sefton CHIP 15%).
              </div>
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
                  sub="Headline, void-cycle basis"
                  accent={C.purple}
                />
                <HeroStat
                  label="Loss avoided per event"
                  value={gbp0.format(r.perLossValue)}
                  sub={voidWeeks + " wk lost fee + " + gbp0.format(refillCost) + " refill"}
                  accent={C.blue}
                />
                <HeroStat
                  label="Return on Whzan cost"
                  value={num1(roi) + "\u00D7"}
                  sub={"Net " + gbp0.format(netBenefit)}
                  accent={C.primary}
                />
              </div>
            </div>


            {/* Lever cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <LeverCard
                tag="Lever 1"
                title="Premature-loss avoidance"
                value={gbp0.format(r.retainedWindow)}
                accent={C.blue}
                rows={[
                  ["Lost fee income (" + voidWeeks + " wk void)", gbp0.format(r.lostIncomeTotal)],
                  ["Refill cost avoided", gbp0.format(r.refillTotal)],
                  ["Premature losses avoided", num2(r.lossesOverHorizon) + " over " + months + " mo"],
                ]}
                note={"One refill cycle per prevented loss: " + voidWeeks + " wk lost fee + " + gbp0.format(refillCost) + " refill. The bed refills, so this is the void gap, not full tenure."}
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
                note="Operational saving from fewer escalations. Shown separately, not in the headline."
              />
            </div>

            {/* Cost & position */}
            <div style={card}>
              <SectionTitle icon={<CalendarRange size={16} />} text="Cost & position" />
              <SummaryRow label="Whzan cost" value={gbp0.format(whzanCost)} />
              <SummaryRow label="Gross retained revenue (Lever 1)" value={gbp0.format(retainedHeadline)} strong color={C.purple} />
              <SummaryRow label="Net revenue benefit" value={gbp0.format(netBenefit)} strong color={C.primary} />
              <SummaryRow label="Payback period" value={paybackMonths ? num1(paybackMonths) + " months" : "n/a"} />
              <SummaryRow label="Staff time recovered (Lever 2, additional)" value={gbp0.format(staffValue)} />
            </div>

            {/* Admission chain */}
            <div style={card}>
              <SectionTitle icon={<Info size={16} />} text="Admission chain (over the contract, central case)" />
              <ChainRow label={"Occupied beds (" + num1(p.beds) + " beds x " + num1(p.occupancy) + "%)"} value={num1(r.occupiedBeds)} />
              <ChainRow label={"Emergency admissions (x " + num2(p.admissionRate) + "/resident/yr x " + num1(p.horizonYears) + " yr)"} value={num1(r.admissionsPerYear * p.horizonYears)} />
              <ChainRow label={"Admissions avoided (x " + Math.round(selectedEffect * 100) + "% effect)"} value={num1(r.admissionsAvoidedHorizon)} highlight />
              <ChainRow label={"Premature losses avoided (x " + num1(p.tenancyLossRate) + "% placement loss)"} value={num2(r.lossesOverHorizon)} highlight />
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
                Baseline hospital activity for this Care Home Group, scaled to your beds, occupancy and care type. These figures
                are illustrative context for the conversation; the retained revenue and ROI above are driven solely by
                Lever 1 and are not affected by anything here.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
                <ActivityTile color={C.blue3} value={num1(aeAttendancesYr)} label={"A&E attendances / yr (x " + aeRate.toFixed(2) + ")"} />
                <ActivityTile color={C.blue} value={num1(r.admissionsPerYear)} label={"Emergency admissions / yr (x " + num2(p.admissionRate) + ")"} />
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
                Residential homes run ~32% more A&E attendances and ~22% more emergency admissions than nursing, reflecting
                lower on-site clinical cover. The 22% is in the ROI via the admission rate; the 32% A&E figure is context only.
                IAU 2019, Table 2.
              </div>
            </div>

            {/* Footnotes */}
            <div style={{ ...card, background: "#FBFCFE" }}>
              <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.6 }}>
                <strong style={{ color: C.ink }}>Why profit beats this number:</strong> the figure is gross retained revenue.
                With a high fixed-cost base, an empty bed sheds only marginal cost, so the operating-profit impact exceeds the
                gross figure shown.
                <br />
                <br />
                <strong style={{ color: C.ink }}>Basis:</strong> each prevented permanent loss is one bed-refill cycle (void
                weeks x weekly fee + average refill cost), because at 85 to 91% occupancy the bed refills. No direct UK
                void-days figure exists, so the 4 to 8 week void is triangulated.
                <br />
                <br />
                <strong style={{ color: C.ink }}>Evidence base:</strong> IAU 2019 (admissions 0.70 blended, 0.77 residential,
                0.63 nursing); placement loss 20% = in-hospital death ~12% (Keevil 2018) + survivor non-return ~8pp (Intrator
                2009, range 17 to 27%); Knight Frank 2024 (occupancy, length of stay); LaingBuisson 2024/25 (fees); AHSN NENC /
                HealthCall / Sefton CHIP (effect size). Effect and non-return figures are magnitude-uncertain. Defaults are
                deliberately conservative.
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
