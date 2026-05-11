#!/usr/bin/env python3
"""
Batch bribery analysis script: Compute bribery costs for public, private, and noised mechanisms
for all proposals in specified DAOs.

Usage: python3 batch_bribery_analysis.py dao1 dao2 dao3 ...
"""

# Force single-threaded BLAS to avoid oversubscription
import os
for v in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ.setdefault(v, "1")

import sys
import argparse
import time
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from tqdm import tqdm
import multiprocessing as mp
from functools import partial
import pickle

# Add the current directory to path to import bribery_model
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import core as bribery_model

# Configuration
SNAPSHOT_CSV = "../data_input/all_snapshot.csv"
NOISE_RATIO_TARGET = 0.1  # 1% of total weight as 95% quantile of noise (meaningful difference)
OUTPUT_DIR = "aux2"

def calculate_epsilon_for_target_noise(w_max: float, W_total: float) -> float:
    return (np.log(20.0)) / (NOISE_RATIO_TARGET * W_total)

def compute_proposal_bribery_costs(w: np.ndarray, locs: np.ndarray, 
                                 proposal_id: str, dao_id: str) -> dict:
    """Compute bribery costs for a single proposal."""
    
    W_total = w.sum()
    w_max = w.max()
    
    # Skip whale-dominated proposals
    if W_total - w_max < w_max:
        return None
    
    # Calculate epsilon for target noise level
    epsilon_target = calculate_epsilon_for_target_noise(w_max, W_total)
    
    try:
        # Test both sides and choose the one where Private > Public (correct cost ordering)
        results_yes = {}
        results_no = {}
        
        # Compute costs for "yes" side
        B_pub_yes, _ = bribery_model.find_min_budget(
            w, locs, bribery_model.SIGMA, bribery_model.advantage_public,
            bribery_model.P_TARGET, "yes"
        )
        B_priv_yes, _ = bribery_model.find_min_budget(
            w, locs, bribery_model.SIGMA, bribery_model.advantage_private,
            bribery_model.P_TARGET, "yes"
        )
        
        # Compute noised cost with target epsilon
        original_epsilon = bribery_model.EPSILON_NOISE
        bribery_model.EPSILON_NOISE = epsilon_target
        try:
            B_nois_yes, _ = bribery_model.find_min_budget(
                w, locs, bribery_model.SIGMA, bribery_model.advantage_noised,
                bribery_model.P_TARGET, "yes"
            )
        finally:
            bribery_model.EPSILON_NOISE = original_epsilon
        
        if not (pd.isna(B_pub_yes) or pd.isna(B_priv_yes) or pd.isna(B_nois_yes)):
            results_yes = {
                'public': B_pub_yes,
                'private': B_priv_yes, 
                'noised': B_nois_yes,
                'side': 'yes'
            }
        
        # Compute costs for "no" side
        B_pub_no, _ = bribery_model.find_min_budget(
            w, locs, bribery_model.SIGMA, bribery_model.advantage_public,
            bribery_model.P_TARGET, "no"
        )
        B_priv_no, _ = bribery_model.find_min_budget(
            w, locs, bribery_model.SIGMA, bribery_model.advantage_private,
            bribery_model.P_TARGET, "no"
        )
        
        # Compute noised cost with target epsilon
        bribery_model.EPSILON_NOISE = epsilon_target
        try:
            B_nois_no, _ = bribery_model.find_min_budget(
                w, locs, bribery_model.SIGMA, bribery_model.advantage_noised,
                bribery_model.P_TARGET, "no"
            )
        finally:
            bribery_model.EPSILON_NOISE = original_epsilon
        
        if not (pd.isna(B_pub_no) or pd.isna(B_priv_no) or pd.isna(B_nois_no)):
            results_no = {
                'public': B_pub_no,
                'private': B_priv_no,
                'noised': B_nois_no,
                'side': 'no'
            }
        
        # Choose the side where Private > Public (correct cost ordering)
        chosen_results = None
        if results_yes and results_yes['private'] > results_yes['public']:
            chosen_results = results_yes
        elif results_no and results_no['private'] > results_no['public']:
            chosen_results = results_no
        elif results_yes:  # Fallback to yes if available
            chosen_results = results_yes
        elif results_no:   # Fallback to no if available
            chosen_results = results_no
        
        if chosen_results:
            # Store ratios against public cost
            public_cost = chosen_results['public']
            return {
                'dao_id': dao_id,
                'proposal_id': proposal_id,
                'public_ratio': 1.0,  # Always 1.0 (baseline)
                'private_ratio': chosen_results['private'] / public_cost,
                'noised_ratio_100pct': chosen_results['noised'] / public_cost,
                'target_side': chosen_results['side'],
                'epsilon_100pct': epsilon_target,
                'w_max': w_max,
                'W_total': W_total,
                'num_voters': len(w),
                # Also store absolute values for reference
                'public_cost_abs': public_cost,
                'private_cost_abs': chosen_results['private'],
                'noised_cost_abs': chosen_results['noised']
            }
    
    except Exception as e:
        print(f"Error processing proposal {proposal_id[:10]}: {e}")
        return None
    
    return None

def process_single_proposal(args_tuple):
    """Process a single proposal - wrapper function for multiprocessing."""
    weights, choice_codes, proposal_id, dao_id = args_tuple
    
    # Build locations array in the worker process
    locs = bribery_model.build_locs(choice_codes, bribery_model.SIGMA)
    
    return compute_proposal_bribery_costs(weights, locs, proposal_id, dao_id)

def load_existing_results(output_file: str) -> pd.DataFrame:
    """Load existing results from CSV file if it exists."""
    if os.path.exists(output_file):
        try:
            return pd.read_csv(output_file)
        except Exception as e:
            print(f"Warning: Could not load existing results from {output_file}: {e}")
            return pd.DataFrame()
    return pd.DataFrame()

def save_results_batch(results_batch: list, output_file: str, force_recompute: bool = False) -> None:
    """Save a batch of results to the CSV file."""
    if not results_batch:
        return
    
    df_new = pd.DataFrame(results_batch)
    
    if force_recompute and os.path.exists(output_file):
        # Load existing data, remove any existing entries for these proposals, then append new ones
        try:
            df_existing = pd.read_csv(output_file)
            # Remove existing entries for these proposals if they exist
            for result in results_batch:
                df_existing = df_existing[~((df_existing['dao_id'] == result['dao_id']) & 
                                         (df_existing['proposal_id'] == result['proposal_id']))]
            # Combine and save
            df_combined = pd.concat([df_existing, df_new], ignore_index=True)
            df_combined.to_csv(output_file, mode='w', header=True, index=False)
        except Exception as e:
            print(f"Warning: Error handling force recompute for {output_file}: {e}")
            # Fallback to append mode
            df_new.to_csv(output_file, mode='a', header=False, index=False)
    elif os.path.exists(output_file):
        # Append to existing file
        df_new.to_csv(output_file, mode='a', header=False, index=False)
    else:
        # Create new file with header
        df_new.to_csv(output_file, mode='w', header=True, index=False)

def process_dao(dao_id: str, all_votes_df: pd.DataFrame, output_file: str, 
               num_processes: int = None, force_recompute: bool = False) -> int:
    """Process all proposals for a single DAO with parallel processing and incremental saving."""
    dao_df = all_votes_df[all_votes_df["dao_id"] == dao_id].copy()
    if dao_df.empty:
        print(f"No data found for DAO: {dao_id}")
        return 0
    
    proposals = dao_df["proposal_id"].unique()
    print(f"Found {len(proposals)} proposals for {dao_id}")
    
    # Load existing results to check for duplicates (unless forcing recomputation)
    if force_recompute:
        proposals_to_process = proposals
        print(f"Force recompute enabled - processing all {len(proposals_to_process)} proposals for {dao_id}")
    else:
        existing_df = load_existing_results(output_file)
        if not existing_df.empty:
            existing_proposals = set(existing_df[existing_df['dao_id'] == dao_id]['proposal_id'].values)
            proposals_to_process = [p for p in proposals if p not in existing_proposals]
            print(f"Skipping {len(proposals) - len(proposals_to_process)} already computed proposals")
            print(f"Processing {len(proposals_to_process)} new proposals for {dao_id}")
        else:
            proposals_to_process = proposals
            print(f"Processing all {len(proposals_to_process)} proposals for {dao_id}")
    
    if len(proposals_to_process) == 0:
        print(f"All proposals for {dao_id} already computed")
        return 0
    
    # Determine number of processes to use
    if num_processes is None:
        num_processes = min(mp.cpu_count(), len(proposals_to_process))
    else:
        num_processes = min(num_processes, mp.cpu_count(), len(proposals_to_process))
    
    print(f"Using {num_processes} processes for parallel processing")
    
    # Prepare data for parallel processing - send only numpy arrays, not DataFrames
    proposal_args = []
    for pid in proposals_to_process:
        sub = dao_df[dao_df["proposal_id"] == pid]
        weights = sub["weight"].values
        choice_codes = sub["choice_code"].astype(int).values
        proposal_args.append((weights, choice_codes, pid, dao_id))
    
    processed_count = 0
    chunksize = max(1, len(proposal_args) // (num_processes * 4))  # Let pool handle chunking
    
    # Process proposals in parallel using imap_unordered for better load balancing
    with mp.Pool(processes=num_processes) as pool:
        results = list(tqdm(
            pool.imap_unordered(process_single_proposal, proposal_args, chunksize=chunksize),
            total=len(proposal_args),
            desc=f"Processing {dao_id}"
        ))
        
        # Filter out None results and save all results at once
        valid_results = [r for r in results if r is not None]
        if valid_results:
            save_results_batch(valid_results, output_file, force_recompute=force_recompute)
            processed_count = len(valid_results)
    
    return processed_count

def create_cost_ratio_boxplot(df_results: pd.DataFrame, dao_ids: list, output_file: str) -> str:
    """Create a box plot showing cost ratio distributions for each DAO."""
    
    # Calculate statistics by DAO and filter out DAOs with less than 5 proposals
    dao_stats = []
    for dao_id in df_results['dao_id'].unique():
        dao_data = df_results[df_results['dao_id'] == dao_id]
        if len(dao_data) >= 5:  # Only include DAOs with 5+ proposals
            dao_stats.append({
                'dao_id': dao_id,
                'num_proposals': len(dao_data),
                'private_median': dao_data['private_ratio'].median(),
                'noised_median': dao_data['noised_ratio_100pct'].median()
            })
    
    # Convert to DataFrame and sort by private median ratio
    dao_stats_df = pd.DataFrame(dao_stats)
    dao_stats_df = dao_stats_df.sort_values('private_median', ascending=False)
    
    if len(dao_stats_df) == 0:
        print("Warning: No DAOs with 5+ proposals found for box plot")
        return ""
    
    # Set up the plot
    try:
        plt.style.use('seaborn-v0_8-whitegrid')
    except:
        try:
            plt.style.use('seaborn-whitegrid')
        except:
            pass  # Use default style
    
    fig, ax = plt.subplots(figsize=(12, max(8, len(dao_stats_df) * 0.4)))
    
    # Colors for the mechanisms
    colors = {
        'public': '#2E86C1',      # Blue
        'private': '#E74C3C',     # Red  
        'noised': '#28B463'       # Green
    }
    
    # Y positions for DAOs with larger spacing
    y_positions = np.arange(len(dao_stats_df)) * 1.5  # Multiply by 1.5 to increase space between DAOs
    
    # Create box plots for each DAO - use the same order as dao_stats_df
    private_data = []
    noised_data = []
    for dao_id in dao_stats_df['dao_id']:
        dao_data = df_results[df_results['dao_id'] == dao_id]
        private_data.append(dao_data['private_ratio'].values)
        noised_data.append(dao_data['noised_ratio_100pct'].values)
    
    # Plot horizontal box plots with offset
    offset = 0.15  # Smaller offset to bring boxes closer together
    box_width = 0.25  # Even narrower boxes
    
    # Filter out values with ratios smaller than 1 (since we're only interested in cases where bribery costs increase)
    private_data_filtered = []
    noised_data_filtered = []
    for p_data, n_data in zip(private_data, noised_data):
        private_data_filtered.append(p_data[p_data >= 1.0])
        noised_data_filtered.append(n_data[n_data >= 1.0])
    
    # Private boxes slightly above center
    bp_private = ax.boxplot(private_data_filtered, positions=y_positions + offset, vert=False,
                           widths=box_width, patch_artist=True,
                           boxprops=dict(facecolor=colors['private'], alpha=0.6),
                           medianprops=dict(color='black', linewidth=1.5),
                           flierprops=dict(marker='o', markerfacecolor=colors['private'],
                                         markersize=3, alpha=0.3),  # Even smaller, more transparent outliers
                           tick_labels=[''] * len(y_positions))
    
    # Noised boxes slightly below center
    bp_noised = ax.boxplot(noised_data_filtered, positions=y_positions - offset, vert=False,
                          widths=box_width, patch_artist=True,
                          boxprops=dict(facecolor=colors['noised'], alpha=0.6),
                          medianprops=dict(color='black', linewidth=1.5),
                          flierprops=dict(marker='o', markerfacecolor=colors['noised'],
                                        markersize=3, alpha=0.3),  # Even smaller, more transparent outliers
                          tick_labels=[''] * len(y_positions))
    
    # Customize the plot
    ax.set_yticks(y_positions)
    ax.set_yticklabels(dao_stats_df['dao_id'], fontsize=18)
    
    # Adjust y-axis limits to accommodate the offset boxes
    ax.set_ylim(min(y_positions) - 1, max(y_positions) + 1)
    ax.set_xlabel('Cost Ratio (relative to Public Budget)', fontsize=28)
    ax.set_ylabel('DAO', fontsize=28)
    
    # Set x-axis to log scale and limit to 1e4
    ax.set_xscale('log')
    ax.set_xlim(0.8, 1e4)
    
    # Set tick label font sizes
    ax.tick_params(axis='both', which='major', labelsize=16)
    
    # Add vertical dashed line at x=1.0 (10^0) to mark the baseline
    ax.axvline(x=1.0, color='blue', linestyle='--', alpha=0.7, linewidth=1.5, zorder=1)
    
    # Create custom legend
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor=colors['private'], alpha=0.6, label='Winner-Only'),
        Patch(facecolor=colors['noised'], alpha=0.6, label='Tally Perturbation = 10%')
    ]
    ax.legend(handles=legend_elements, loc='upper right', bbox_to_anchor=(0.92, 0.98), frameon=True, fancybox=True, shadow=True, fontsize=24)
    
    # Add grid
    ax.grid(True, alpha=0.3)
    
    # Add text annotations showing number of proposals - use the same order as the plot
    for i, row in dao_stats_df.iterrows():
        ax.text(1e4 * 0.95, y_positions[i], f"n={row['num_proposals']}", 
                ha='right', va='center', fontsize=16, alpha=0.7)
    
    # Tight layout
    plt.tight_layout()
    
    # Save plot
    plot_file = output_file.replace('.csv', '_box_plot.png')
    plt.savefig(plot_file, dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    
    return plot_file

def create_cost_ratio_plot(df_results: pd.DataFrame, dao_ids: list, output_file: str) -> str:
    """Create a plot showing average cost ratios for each DAO, similar to the attached image."""
    
    # Calculate averages by DAO and filter out DAOs with less than 5 proposals
    dao_averages = df_results.groupby('dao_id').agg({
        'public_ratio': 'mean',
        'private_ratio': 'mean', 
        'noised_ratio_100pct': 'mean',
        'proposal_id': 'count'  # Number of proposals
    }).reset_index()
    dao_averages.rename(columns={'proposal_id': 'num_proposals'}, inplace=True)
    
    # Filter out DAOs with less than 5 proposals
    dao_averages = dao_averages[dao_averages['num_proposals'] >= 5]
    
    if len(dao_averages) == 0:
        print("Warning: No DAOs with 5+ proposals found for cost ratio plot")
        return ""
    
    # Sort DAOs by private ratio (descending) for better visualization
    dao_averages = dao_averages.sort_values('private_ratio', ascending=False)
    
    # Set up the plot
    try:
        plt.style.use('seaborn-v0_8-whitegrid')
    except:
        try:
            plt.style.use('seaborn-whitegrid')
        except:
            pass  # Use default style
    
    fig, ax = plt.subplots(figsize=(12, max(8, len(dao_averages) * 0.4)))
    
    # Colors for the three mechanisms
    colors = {
        'public': '#2E86C1',      # Blue
        'private': '#E74C3C',     # Red  
        'noised': '#28B463'       # Green
    }
    
    # Y positions for DAOs
    y_positions = np.arange(len(dao_averages))
    
    # Plot points for private and noised mechanisms - use the same order as dao_averages
    ax.scatter(dao_averages['private_ratio'].values, y_positions, 
              color=colors['private'], s=80, alpha=0.8, label='Winner-Only', zorder=3)
    ax.scatter(dao_averages['noised_ratio_100pct'].values, y_positions, 
              color=colors['noised'], s=80, alpha=0.8, label='Tally Perturbation = 10%', zorder=3)
    
    # Add vertical line at ratio = 1.0 (public cost baseline)
    ax.axvline(x=1.0, color=colors['public'], linestyle='--', alpha=0.7, linewidth=2, 
               label='Public (baseline)', zorder=1)
    
    # Customize the plot
    ax.set_yticks(y_positions)
    ax.set_yticklabels(dao_averages['dao_id'].values, fontsize=18)
    ax.set_xlabel('Relative B-Privacy', fontsize=28)
    ax.set_ylabel('DAO', fontsize=28)
    
    # Set x-axis to log scale if there's a wide range of values
    max_ratio = max(dao_averages['private_ratio'].max(), dao_averages['noised_ratio_100pct'].max())
    if max_ratio > 10:
        ax.set_xscale('log')
        ax.set_xlim(0.8, max_ratio * 1.2)
    else:
        ax.set_xlim(0.9, max_ratio * 1.1)
    
    # Set tick label font sizes
    ax.tick_params(axis='both', which='major', labelsize=16)
    
    # Add legend
    ax.legend(loc='upper right', bbox_to_anchor=(0.95, 0.98), frameon=True, fancybox=True, shadow=True, fontsize=24)
    
    # Add grid
    ax.grid(True, alpha=0.3)
    
    # Add text annotations showing number of proposals - use the same order as the plot
    for i, (_, row) in enumerate(dao_averages.iterrows()):
        ax.text(max_ratio * 1.3, i, f"n={row['num_proposals']}", 
                ha='left', va='center', fontsize=16, alpha=0.7)
    
    # Tight layout
    plt.tight_layout()
    
    # Save plot
    plot_file = output_file.replace('.csv', '_cost_ratios.png')
    plt.savefig(plot_file, dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    
    return plot_file

def create_geometric_mean_cost_ratio_plot(df_results: pd.DataFrame, dao_ids: list, output_file: str) -> str:
    """Create a plot showing geometric mean cost ratios for each DAO."""
    
    # Calculate geometric means by DAO and filter out DAOs with less than 5 proposals
    dao_geometric_means = []
    
    for dao_id in df_results['dao_id'].unique():
        dao_data = df_results[df_results['dao_id'] == dao_id]
        if len(dao_data) >= 5:  # Only include DAOs with 5+ proposals
            # Calculate geometric mean for private ratio
            private_ratios = dao_data['private_ratio'].dropna()
            if len(private_ratios) > 0 and (private_ratios > 0).all():
                private_geometric_mean = np.exp(np.log(private_ratios).mean())
            else:
                private_geometric_mean = float('nan')
            
            # Calculate geometric mean for noised ratio
            noised_ratios = dao_data['noised_ratio_100pct'].dropna()
            if len(noised_ratios) > 0 and (noised_ratios > 0).all():
                noised_geometric_mean = np.exp(np.log(noised_ratios).mean())
            else:
                noised_geometric_mean = float('nan')
            
            dao_geometric_means.append({
                'dao_id': dao_id,
                'num_proposals': len(dao_data),
                'private_geometric_mean': private_geometric_mean,
                'noised_geometric_mean': noised_geometric_mean
            })
    
    # Convert to DataFrame and sort by private geometric mean ratio
    dao_geometric_df = pd.DataFrame(dao_geometric_means)
    dao_geometric_df = dao_geometric_df.sort_values('private_geometric_mean', ascending=False)
    
    if len(dao_geometric_df) == 0:
        print("Warning: No DAOs with 5+ proposals found for geometric mean cost ratio plot")
        return ""
    
    # Set up the plot
    try:
        plt.style.use('seaborn-v0_8-whitegrid')
    except:
        try:
            plt.style.use('seaborn-whitegrid')
        except:
            pass  # Use default style
    
    fig, ax = plt.subplots(figsize=(12, max(8, len(dao_geometric_df) * 0.4)))
    
    # Colors for the three mechanisms
    colors = {
        'public': '#2E86C1',      # Blue
        'private': '#E74C3C',     # Red  
        'noised': '#28B463'       # Green
    }
    
    # Y positions for DAOs
    y_positions = np.arange(len(dao_geometric_df))
    
    # Plot points for private and noised mechanisms - use the same order as dao_geometric_df
    ax.scatter(dao_geometric_df['private_geometric_mean'].values, y_positions, 
              color=colors['private'], s=80, alpha=0.8, label='Winner-Only', zorder=3)
    ax.scatter(dao_geometric_df['noised_geometric_mean'].values, y_positions, 
              color=colors['noised'], s=80, alpha=0.8, label='Tally Perturbation = 10%', zorder=3)
    
    # Add vertical line at ratio = 1.0 (public cost baseline)
    ax.axvline(x=1.0, color=colors['public'], linestyle='--', alpha=0.7, linewidth=2, 
               label='Public (baseline)', zorder=1)
    
    # Customize the plot
    ax.set_yticks(y_positions)
    ax.set_yticklabels(dao_geometric_df['dao_id'].values, fontsize=18)
    ax.set_xlabel('Relative B-Privacy (Geometric Mean)', fontsize=28)
    ax.set_ylabel('DAO', fontsize=28)
    
    # Set x-axis to log scale if there's a wide range of values
    max_ratio = max(dao_geometric_df['private_geometric_mean'].max(), dao_geometric_df['noised_geometric_mean'].max())
    if max_ratio > 10:
        ax.set_xscale('log')
        ax.set_xlim(0.8, max_ratio * 1.2)
        # Use LogLocator to ensure ticks appear at powers of 10
        ax.xaxis.set_major_locator(plt.LogLocator(base=10.0, numticks=20))
        ax.xaxis.set_minor_locator(plt.LogLocator(base=10.0, subs=np.arange(2, 10) * 0.1))
        # Format major ticks to show only powers of 10
        ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, pos: f'{int(x)}' if x >= 1 and x % 10 == 0 else ''))
        # No minor tick labels
        ax.xaxis.set_minor_formatter(plt.NullFormatter())
        # Ensure ticks are visible
        ax.tick_params(axis='x', which='major', length=8, width=1.5, labelsize=16)
        ax.tick_params(axis='x', which='minor', length=4, width=1)
    else:
        ax.set_xlim(0.9, max_ratio * 1.1)
        # Set linear-scale ticks
        ax.xaxis.set_major_locator(plt.AutoLocator())
    
    # Set tick label font sizes
    ax.tick_params(axis='both', which='major', labelsize=16)
    
    # Add legend
    ax.legend(loc='upper right', bbox_to_anchor=(0.95, 0.98), frameon=True, fancybox=True, shadow=True, fontsize=20)
    
    # Add grid
    ax.grid(True, alpha=0.3)
    
    # Add text annotations showing number of proposals - use the same order as the plot
    for i, (_, row) in enumerate(dao_geometric_df.iterrows()):
        ax.text(max_ratio * 1.3, i, f"n={row['num_proposals']}", 
                ha='left', va='center', fontsize=16, alpha=0.7)
    
    # Tight layout
    plt.tight_layout()
    
    # Save plot
    plot_file = output_file.replace('.csv', '_cost_ratios_geometric_mean.png')
    plt.savefig(plot_file, dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    
    return plot_file

def create_dao_summary(all_votes_df: pd.DataFrame) -> str:
    """Create a summary CSV with DAO statistics."""
    dao_stats = []
    
    for dao_id in tqdm(all_votes_df['dao_id'].unique(), desc="Computing DAO statistics"):
        dao_df = all_votes_df[all_votes_df['dao_id'] == dao_id]
        
        # Basic statistics
        num_proposals = dao_df['proposal_id'].nunique()
        total_votes = len(dao_df)
        
        # Compute average voters per proposal
        voters_per_proposal = dao_df.groupby('proposal_id')['voter_address'].nunique()
        avg_voters_per_proposal = voters_per_proposal.mean()
        
        # Compute average voting power per proposal
        voting_power_per_proposal = dao_df.groupby('proposal_id')['weight'].sum()
        avg_voting_power = voting_power_per_proposal.mean()
        
        # Whale statistics (max voting power percentage per proposal)
        whale_stats = []
        for pid in dao_df['proposal_id'].unique():
            proposal_votes = dao_df[dao_df['proposal_id'] == pid]
            total_power = proposal_votes['weight'].sum()
            max_power = proposal_votes['weight'].max()
            whale_pct = (max_power / total_power * 100) if total_power > 0 else 0
            whale_stats.append(whale_pct)
        
        avg_whale_percentage = np.mean(whale_stats) if whale_stats else 0
        
        dao_stats.append({
            'dao_id': dao_id,
            'num_proposals': num_proposals,
            'total_votes': total_votes,
            'avg_voters_per_proposal': avg_voters_per_proposal,
            'avg_voting_power_per_proposal': avg_voting_power,
            'avg_whale_percentage': avg_whale_percentage
        })
    
    # Create DataFrame and save
    df_summary = pd.DataFrame(dao_stats)
    df_summary = df_summary.sort_values('num_proposals', ascending=False)
    
    summary_file = f"{OUTPUT_DIR}/dao_summary.csv"
    df_summary.to_csv(summary_file, index=False)
    
    print(f"\nDAO Summary Statistics:")
    print(f"Total DAOs: {len(df_summary)}")
    print(f"Total proposals: {df_summary['num_proposals'].sum()}")
    print(f"Average proposals per DAO: {df_summary['num_proposals'].mean():.1f}")
    print(f"Average voters per proposal (across all DAOs): {df_summary['avg_voters_per_proposal'].mean():.1f}")
    
    return summary_file

def main():
    parser = argparse.ArgumentParser(description='Batch bribery analysis for multiple DAOs')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--all-daos', action='store_true', help='Process all DAOs found in the input data')
    group.add_argument('--dao-ids', nargs='+', help='Specific DAO IDs to process')

    parser.add_argument('--output-file', type=str, 
                       help='Output CSV file (default: auto-generated)')
    parser.add_argument('--create-dao-summary', action='store_true',
                       help='Create DAO summary statistics file')
    parser.add_argument('--force-recompute', action='store_true',
                       help='Force recomputation of all proposals (ignore existing results)')
    parser.add_argument('--plot-only', action='store_true',
                       help='Only generate plot from existing CSV data (no processing)')
    parser.add_argument('--num-processes', type=int, default=None,
                       help='Number of processes to use for parallel processing (default: CPU count)')
    
    args = parser.parse_args()
    
    # Create output directory
    Path(OUTPUT_DIR).mkdir(exist_ok=True)
    
    # Generate output filename (consistent, no timestamp for reuse)
    if args.output_file:
        output_file = args.output_file
    else:
        output_file = f"{OUTPUT_DIR}/bribery_costs_all_daos_normal.csv"

    # Generate plot only if requested
    if args.plot_only:
        if not os.path.exists(output_file):
            print(f"Error: CSV file not found: {output_file}")
            return 1
        
        print("Loading existing results...")
        df_results = load_existing_results(output_file)
        if df_results.empty:
            print("Error: No data found in CSV file")
            return 1
        
        all_daos_in_csv = df_results['dao_id'].unique().tolist()
        # Filter out stgdao.eth from visualization as well
        all_daos_in_csv = [dao for dao in all_daos_in_csv if (dao != 'stgdao.eth')]
        print(f"Creating visualizations for {len(all_daos_in_csv)} DAOs (excluding stgdao.eth): {', '.join(sorted(all_daos_in_csv))}")
        
        # Generate scatter plot
        scatter_plot_file = create_cost_ratio_plot(df_results, all_daos_in_csv, output_file)
        print(f"Scatter plot saved to: {scatter_plot_file}")
        
        # Generate box plot
        box_plot_file = create_cost_ratio_boxplot(df_results, all_daos_in_csv, output_file)
        print(f"Box plot saved to: {box_plot_file}")
        
        # Generate geometric mean plot
        geometric_mean_plot_file = create_geometric_mean_cost_ratio_plot(df_results, all_daos_in_csv, output_file)
        print(f"Geometric mean plot saved to: {geometric_mean_plot_file}")
        return 0
        
    # Load and clean voting data for processing
    print("Loading and cleaning voting data...")
    if not os.path.exists(SNAPSHOT_CSV):
        print(f"Error: Data file not found: {SNAPSHOT_CSV}")
        return 1
    
    all_votes_df = bribery_model.load_and_clean(SNAPSHOT_CSV)
    print(f"Loaded {len(all_votes_df)} votes")
    
    # Create DAO summary if requested
    if args.create_dao_summary:
        summary_file = create_dao_summary(all_votes_df)
        print(f"DAO summary saved to: {summary_file}")
        return 0
    
    # Get list of DAOs to process
    if args.all_daos:
        dao_ids = all_votes_df['dao_id'].unique().tolist()
        # Skip stgdao.eth
        dao_ids = [dao for dao in dao_ids if (dao != 'stgdao.eth')]
        print(f"\nProcessing all {len(dao_ids)} DAOs found in the dataset (excluding stgdao.eth)")
    else:
        dao_ids = args.dao_ids
        # Also skip stgdao.eth if it's in the manually specified list
        if 'stgdao.eth' in dao_ids:
            dao_ids = [dao for dao in dao_ids if (dao != 'stgdao.eth')]
            print("Note: stgdao.eth has been excluded from processing")

    # Process each DAO with incremental saving
    total_processed = 0
    start_time = time.time()
    
    for dao_id in dao_ids:
        print(f"\n{'='*60}")
        print(f"Processing DAO: {dao_id}")
        print(f"{'='*60}")
        
        processed_count = process_dao(dao_id, all_votes_df, output_file, 
                                    num_processes=args.num_processes, 
                                    force_recompute=args.force_recompute)
        total_processed += processed_count
        
        print(f"Completed {dao_id}: {processed_count} new proposals processed")
    
    # Load final results for analysis and plotting
    if total_processed > 0 or os.path.exists(output_file):
        df_results = load_existing_results(output_file)
        
        if not df_results.empty:
            # Keep all DAOs in the CSV file for plotting, not just the ones processed in this run
            all_daos_in_csv = df_results['dao_id'].unique().tolist()
            # Filter out stgdao.eth from visualization as well
            all_daos_in_csv = [dao for dao in all_daos_in_csv if dao != 'stgdao.eth']
            print(f"CSV contains data for {len(all_daos_in_csv)} DAOs (excluding stgdao.eth): {', '.join(sorted(all_daos_in_csv))}")
            
            # For statistics, show only the DAOs processed in this run
            df_current_run = df_results[df_results['dao_id'].isin(dao_ids)]
        
            # Print summary
            elapsed = time.time() - start_time
            print(f"\n{'='*60}")
            print(f"BATCH ANALYSIS COMPLETE")
            print(f"{'='*60}")
            print(f"Total new proposals processed: {total_processed}")
            print(f"Total proposals in current run: {len(df_current_run) if not df_current_run.empty else 0}")
            print(f"Total proposals in full dataset: {len(df_results)}")
            print(f"Total time: {elapsed:.1f} seconds")
            if total_processed > 0:
                print(f"Average time per new proposal: {elapsed/total_processed:.2f} seconds")
            print(f"Results saved to: {output_file}")
        
            # Print cost ratio statistics for current run (if any)
            if not df_current_run.empty:
                print(f"\nCost Ratio Statistics for Current Run (relative to public cost):")
                print(f"Public ratio:  mean={df_current_run['public_ratio'].mean():.4f}, std={df_current_run['public_ratio'].std():.4f}")
                print(f"Private ratio: mean={df_current_run['private_ratio'].mean():.4f}, std={df_current_run['private_ratio'].std():.4f}")
                print(f"Noised ratio:  mean={df_current_run['noised_ratio_100pct'].mean():.4f}, std={df_current_run['noised_ratio_100pct'].std():.4f}")
            
                # Print sample results from current run
                print(f"\nSample results from current run (first 5 proposals):")
                print(df_current_run[['dao_id', 'proposal_id', 'public_ratio', 'private_ratio', 'noised_ratio_100pct']].head().to_string(index=False))
            
            # Create visualizations using ALL DAOs in the CSV file
            print(f"\nCreating visualizations for all {len(all_daos_in_csv)} DAOs in dataset...")
            
            # Generate scatter plot
            scatter_plot_file = create_cost_ratio_plot(df_results, all_daos_in_csv, output_file)
            print(f"Scatter plot saved to: {scatter_plot_file}")
            
            # Generate box plot
            box_plot_file = create_cost_ratio_boxplot(df_results, all_daos_in_csv, output_file)
            print(f"Box plot saved to: {box_plot_file}")

            # Generate geometric mean plot
            geometric_mean_plot_file = create_geometric_mean_cost_ratio_plot(df_results, all_daos_in_csv, output_file)
            print(f"Geometric mean plot saved to: {geometric_mean_plot_file}")
        else:
            print("No valid results found!")
            return 1
    else:
        print("No results generated!")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
