import { getStore } from "@/lib/store";
import { ok, fail, asOfFrom } from "@/lib/api";
import { snapshot, kpis, funnelRows, scaleChangeStop, weakestStep, bottlenecks, forecast, cashCollection, weeklySeries, ownerRows, stalled, taskView } from "@/lib/metrics";
import model from "@/data/model_output.json";


export async function GET(req: Request) {
  try {
    const store = getStore();
    const db = await store.load();
    const s = snapshot(db, asOfFrom(req));
    const campaigns = funnelRows(s, "campaign").map((r) => ({ ...r, ...scaleChangeStop(r), weakest_step: weakestStep(r) }));
    return ok({
      meta: { as_of: s.asOf, store: store.kind, event: db.event[0], history_start: db.event[0].history_start.slice(0, 10), history_end: db.event[0].history_end.slice(0, 10) },
      kpis: kpis(s),
      campaigns,
      channel_groups: funnelRows(s, "channel_group"),
      owners: ownerRows(s),
      industries: funnelRows(s, "industry"),
      bottlenecks: bottlenecks(s),
      forecast: forecast(s),
      cash: cashCollection(s),
      series: weeklySeries(db, s.asOf),
      stalled: stalled(s),
      tasks: taskView(s),
      campaign_plan: db.campaign_plan,
      targets: db.targets,
      model: {
        fest: model.fest,
        base: { cash: model.base.cash_by_T14_lakh, signed: model.base.signed_value_lakh, deals: model.base.deals, segments: model.base.segments.map((x) => ({ segment: x.segment, deals: x.deals, signed: x.signed_value_lakh, cash: x.cash_by_T14_lakh })) },
        stretch: { cash: model.stretch.cash_by_T14_lakh, signed: model.stretch.signed_value_lakh, deals: model.stretch.deals, segments: model.stretch.segments.map((x) => ({ segment: x.segment, deals: x.deals, signed: x.signed_value_lakh, cash: x.cash_by_T14_lakh })) },
        status_quo_cash: model.status_quo_cash_by_T14_lakh,
        bets: model.bets,
        cash_curve: model.cash_curve,
      },
    });
  } catch (e) { return fail(e); }
}
