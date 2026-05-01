"""Extracts aggregated plot data as JSON for the website visualizations."""
import json
import os
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "plot_data.json")

df_normal = pd.read_csv(os.path.join(HERE, "privacy_attack_results.csv"))
df_noise = pd.read_csv(os.path.join(HERE, "privacy_attack_results_noise.csv"))

# ---------- Per-DAO bubble plot (4 DAOs) ----------
target_daos = {
    "arbitrumfoundation.eth": "Arbitrum",
    "aavegotchi.eth": "Aavegotchi",
    "sushigov.eth": "Sushi",
    "balancer.eth": "Balancer",
}

df_normal["deanon_percentage"] = (
    df_normal["total_voting_power_deanonymized"] / df_normal["total_voting_power"]
) * 100
df_normal["option1_margin"] = (
    (df_normal["option1_votes"] - df_normal["option2_votes"]) / df_normal["total_voting_power"]
) * 100
df_normal["option1_margin"] = df_normal["option1_margin"].fillna(100)

dao_avg_voters = df_normal.groupby("dao_id")["total_voters"].mean().to_dict()

per_dao = []
for dao_id, label in target_daos.items():
    rows = df_normal[df_normal["dao_id"] == dao_id]
    points = [
        {
            "x": float(r["total_voters"]),
            "y": float(r["deanon_percentage"]),
            "m": float(r["option1_margin"]),
        }
        for _, r in rows.iterrows()
        if pd.notna(r["total_voters"]) and pd.notna(r["deanon_percentage"])
    ]
    per_dao.append(
        {
            "id": dao_id,
            "label": label,
            "avg_voters": float(dao_avg_voters[dao_id]),
            "points": points,
        }
    )

# ---------- Noise comparison bubbles ----------
df_normal["voters_deanon_percentage"] = (
    df_normal["total_deanonymized"] / df_normal["total_voters"]
) * 100
df_normal["voting_power_deanon_percentage"] = (
    df_normal["total_voting_power_deanonymized"] / df_normal["total_voting_power"]
) * 100
df_noise["voters_deanon_percentage"] = (
    df_noise["total_correct"] / df_noise["total_voters"]
) * 100
df_noise["voting_power_deanon_percentage"] = (
    df_noise["total_voting_power_correct"] / df_noise["total_voting_power"]
) * 100

agg_normal = (
    df_normal.groupby("dao_id")
    .agg(
        voters_norm=("voters_deanon_percentage", "mean"),
        power_norm=("voting_power_deanon_percentage", "mean"),
        voters_count=("total_voters", "mean"),
        n_proposals=("proposal_id", "nunique"),
    )
    .reset_index()
)
agg_normal = agg_normal[agg_normal.n_proposals >= 5]

agg_noise = (
    df_noise.groupby("dao_id")
    .agg(
        voters_noise=("voters_deanon_percentage", "mean"),
        power_noise=("voting_power_deanon_percentage", "mean"),
    )
    .reset_index()
)

cmp = agg_normal.merge(agg_noise, on="dao_id")

bubbles = []
for _, r in cmp.iterrows():
    bubbles.append(
        {
            "id": r["dao_id"],
            "voters": float(r["voters_count"]),
            "x_raw": float(r["voters_norm"]),
            "y_raw": float(r["power_norm"]),
            "x_noise": float(r["voters_noise"]),
            "y_noise": float(r["power_noise"]),
        }
    )

data = {
    "per_dao": per_dao,
    "noise_bubbles": bubbles,
}

with open(OUT, "w") as f:
    json.dump(data, f, separators=(",", ":"))

print(f"Wrote {OUT}")
print(f"  per_dao: {len(per_dao)} DAOs")
print(f"  noise bubbles: {len(bubbles)} DAOs")
