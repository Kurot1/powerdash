const sumFacilityUsage = facility =>
  (facility?.usage || []).reduce((total, point) => total + Number(point.kwh || 0), 0);

const aggregateTimeline = facilities => {
  const bucket = new Map();
  facilities.forEach(facility => {
    (facility?.usage || []).forEach(point => {
      const hour = point.hour || "";
      const prev = bucket.get(hour) || 0;
      bucket.set(hour, prev + Number(point.kwh || 0));
    });
  });
  return Array.from(bucket.entries())
    .map(([hour, kwh]) => ({ hour, kwh }))
    .sort((a, b) => (a.hour > b.hour ? 1 : -1));
};

const calcGrowthRate = timeline => {
  if (!timeline.length) return { absolute: 0, percentage: 0 };
  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  const absolute = last.kwh - first.kwh;
  const percentage = first.kwh ? (absolute / first.kwh) * 100 : 0;
  return { absolute, percentage };
};

const summarizeUsage = facilities => {
  const facilityTotals = (facilities || []).map(f => ({
    id: f.id,
    name: f.name,
    category: f.category,
    total: sumFacilityUsage(f),
    baseline: f.baseline,
  }));

  const timeline = aggregateTimeline(facilities || []);
  const totalKwh = timeline.reduce((sum, point) => sum + point.kwh, 0);
  const averageUsage = timeline.length ? totalKwh / timeline.length : 0;

  const highestUsage = facilityTotals.reduce((prev, current) =>
    !prev || current.total > prev.total ? current : prev,
  null);

  const lowestUsage = facilityTotals.reduce((prev, current) =>
    !prev || current.total < prev.total ? current : prev,
  null);

  const peakHour = timeline.reduce((prev, current) =>
    !prev || current.kwh > prev.kwh ? current : prev,
  null);

  const growthRate = calcGrowthRate(timeline);

  return {
    facilityTotals,
    timeline,
    metrics: {
      highestUsage,
      lowestUsage,
      averageUsage,
      peakHour,
      growthRate,
    },
  };
};

module.exports = {
  aggregateTimeline,
  summarizeUsage,
};