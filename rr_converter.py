import tkinter as tk
from tkinter import filedialog, messagebox
import os

def convert_rr_to_timeseries(rr_intervals, max_interval=1400):
    """
    Convert RR intervals to time series format: x=index, y=RR_value
    Good for: Connected scatter, histograms, trend analysis
    
    Args:
        rr_intervals (list): List of RR interval values in milliseconds
        max_interval (int): Maximum allowed RR interval (outliers above this are filtered)
    
    Returns:
        list: List of dictionaries with 'x' and 'y' keys
    """
    xy_pairs = []
    filtered_count = 0
    
    for i, rr in enumerate(rr_intervals):
        if isinstance(rr, (int, float)) and 0 < rr <= max_interval:
            xy_pairs.append({'x': i, 'y': rr})
        else:
            filtered_count += 1
    
    print(f"Time Series: {len(xy_pairs)} points, filtered {filtered_count} outliers")
    return xy_pairs


def convert_rr_to_poincare(rr_intervals, max_interval=1400):
    """
    Convert RR intervals to Poincaré format: x=RR[n], y=RR[n+1]
    Good for: Scatter plots, density plots, HRV analysis, ellipse fitting
    
    Args:
        rr_intervals (list): List of RR interval values in milliseconds
        max_interval (int): Maximum allowed RR interval (outliers above this are filtered)
    
    Returns:
        list: List of dictionaries with 'x' and 'y' keys
    """
    # First filter the data
    filtered_rr = []
    filtered_count = 0
    
    for rr in rr_intervals:
        if isinstance(rr, (int, float)) and 0 < rr <= max_interval:
            filtered_rr.append(rr)
        else:
            filtered_count += 1
    
    # Create Poincaré pairs: current vs next RR interval
    poincare_pairs = []
    for i in range(len(filtered_rr) - 1):
        poincare_pairs.append({'x': filtered_rr[i], 'y': filtered_rr[i + 1]})
    
    print(f"Poincaré: {len(poincare_pairs)} pairs, filtered {filtered_count} outliers")
    return poincare_pairs


def load_rr_file_and_convert(file_path, conversion_type, max_interval=1400):
    """
    Load RR intervals from a text file and convert to x,y pairs.
    
    Args:
        file_path (str): Path to text file with one RR interval per line
        conversion_type (str): Either 'timeseries' or 'poincare'
        max_interval (int): Maximum allowed RR interval
    
    Returns:
        list: List of x,y coordinate dictionaries
    """
    try:
        with open(file_path, 'r') as f:
            rr_intervals = []
            for line in f:
                try:
                    value = float(line.strip())
                    rr_intervals.append(value)
                except ValueError:
                    continue  # Skip invalid lines
        
        print(f"Loaded {len(rr_intervals)} RR intervals from {file_path}")
        
        if conversion_type.lower() == 'poincare':
            return convert_rr_to_poincare(rr_intervals, max_interval)
        else:
            return convert_rr_to_timeseries(rr_intervals, max_interval)
    
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found")
        return []
    except Exception as e:
        print(f"Error reading file: {e}")
        return []


def pick_file_and_convert():
    """
    Open a file picker dialog and convert the selected RR interval file.
    """
    # Hide the root window
    root = tk.Tk()
    root.withdraw()
    
    # Ask user which conversion type they want
    conversion_choice = messagebox.askyesno(
        "Choose Conversion Type",
        "Which format would you like?\n\n"
        "YES = Poincaré Plot (RR[n] vs RR[n+1])\n"
        "     • Best for: HRV analysis, scatter plots, density plots\n"
        "     • Shows: Heart rate variability patterns\n\n"
        "NO = Time Series (index vs RR value)\n"
        "     • Best for: Trend analysis, connected plots\n"
        "     • Shows: RR intervals over time"
    )
    
    conversion_type = "poincare" if conversion_choice else "timeseries"
    
    # Open file picker
    file_path = filedialog.askopenfilename(
        title="Select RR Intervals File",
        filetypes=[
            ("Text files", "*.txt"),
            ("CSV files", "*.csv"),
            ("All files", "*.*")
        ],
        initialdir=os.getcwd()
    )
    
    if not file_path:
        print("No file selected")
        root.destroy()
        return None
    
    print(f"Selected file: {file_path}")
    print(f"Conversion type: {conversion_type}")
    
    # Convert the file
    xy_data = load_rr_file_and_convert(file_path, conversion_type)
    
    if xy_data:
        # Show success message
        conversion_desc = "Poincaré pairs (RR[n] vs RR[n+1])" if conversion_type == "poincare" else "Time series (index vs RR)"
        messagebox.showinfo(
            "Conversion Complete", 
            f"Successfully converted to {conversion_desc}\n\n"
            f"Generated {len(xy_data)} coordinate pairs\n\n"
            f"First 3 points:\n" +
            "\n".join([f"x: {p['x']:.1f}, y: {p['y']:.1f}" for p in xy_data[:3]])
        )
        
        # Ask if user wants to save as CSV
        save_csv = messagebox.askyesno(
            "Save as CSV?", 
            f"Would you like to save the {conversion_desc} as a CSV file?"
        )
        
        if save_csv:
            default_name = f"rr_{conversion_type}.csv"
            save_path = filedialog.asksaveasfilename(
                title=f"Save {conversion_desc} as CSV",
                defaultextension=".csv",
                filetypes=[("CSV files", "*.csv")]
            )
            
            if save_path:
                try:
                    with open(save_path, 'w') as f:
                        f.write("x,y\n")  # Header
                        for point in xy_data:
                            f.write(f"{point['x']},{point['y']}\n")
                    print(f"Saved CSV file: {save_path}")
                    messagebox.showinfo("Saved", f"CSV file saved as:\n{save_path}")
                except Exception as e:
                    messagebox.showerror("Save Error", f"Error saving file: {e}")
    else:
        messagebox.showerror("Conversion Failed", "No valid RR intervals found in the selected file.")
    
    root.destroy()
    return xy_data


# Example usage and testing
if __name__ == "__main__":
    print("RR Interval to X,Y Converter")
    print("=" * 35)
    
    choice = input("\n1. Use file picker\n2. Test with sample data\n3. Test with specific file\nChoice (1-3): ").strip()
    
    if choice == "1":
        xy_data = pick_file_and_convert()
        
    elif choice == "2":
        # Test with sample data
        test_rr = [897.2149, 963.254, 986.1801, 1500, 992.4478, 1020.1549]
        
        print("\nTime Series conversion:")
        ts_result = convert_rr_to_timeseries(test_rr)
        for point in ts_result[:3]:
            print(f"  x: {point['x']}, y: {point['y']}")
            
        print("\nPoincaré conversion:")
        pc_result = convert_rr_to_poincare(test_rr)
        for point in pc_result[:3]:
            print(f"  x: {point['x']}, y: {point['y']}")
            
    elif choice == "3":
        # Test with specific file
        file_path = "data/reconstituted_rr_intervals.txt"
        
        conv_type = input("Conversion type (timeseries/poincare): ").strip().lower()
        if conv_type not in ['timeseries', 'poincare']:
            conv_type = 'timeseries'
            
        xy_data = load_rr_file_and_convert(file_path, conv_type)
        print(f"\nFile conversion result: {len(xy_data)} valid points")
        if xy_data:
            print("First 5 points:")
            for point in xy_data[:5]:
                print(f"  x: {point['x']:.1f}, y: {point['y']:.1f}")
    else:
        print("Invalid choice")