
from pathlib import Path
import json
import calendar
import pandas as pd

# ==========================================
# PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parent.parent
EXCEL = ROOT / "data" / "bills.xlsx"
OUTPUT = ROOT / "data" / "bills.json"

SHEETS = ["Electricity", "Gas", "Water"]

MONTHS = {
    name.lower(): number
    for number, name in enumerate(calendar.month_name)
    if name
}

CHARGE_COLUMNS = {
    "Electricity": [
        "Base Bill",
        "Society Charges",
        "Credit",
    ],
    "Gas": [
        "Gas Charges",
        "Extra Charges",
        "Meter Rent",
        "Fixed Charges",
        "GST",
        "Rebate",
        "Security Deposit",
        "Arrears",
    ],
    "Water": [
        "Other Charges",
        "Base Bill",
    ],
}

UNITS_COLUMNS = {
    "Electricity": "Units",
    "Gas": "Units Consumed",
    "Water": "Units (Gallons)",
}

PREFIXES = {
    "Electricity": "ELEC",
    "Gas": "GAS",
    "Water": "WATER",
}


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def clean_number(value):
    if pd.isna(value) or str(value).strip() == "":
        return 0.0
    return float(value)


def read_utility(sheet):
    df = pd.read_excel(EXCEL, sheet_name=sheet)
    df.columns = df.columns.str.strip()

    # Validate spreadsheet columns
    required = [
        "Year",
        "Month",
        "Total Bill",
        UNITS_COLUMNS[sheet],
    ] + CHARGE_COLUMNS[sheet]

    for column in required:
        if column not in df.columns:
            raise ValueError(
                f"{sheet}: Missing column '{column}'"
            )

    # Remove blank template rows
    df = df.dropna(subset=["Year", "Month"])

    records = []

    for _, row in df.iterrows():

        year = int(row["Year"])
        month_name = str(row["Month"]).strip()
        month_number = MONTHS.get(month_name.lower())

        if month_number is None:
            raise ValueError(
                f"{sheet}: Invalid month '{month_name}'"
            )

        def get(column):
            if column not in df.columns:
                return 0.0
            return clean_number(row[column])

        # Skip incomplete records
        has_charge = any(
            pd.notna(row[column])
            for column in CHARGE_COLUMNS[sheet]
        )

        if not has_charge:
            print(
                f"Skipping incomplete {sheet} record: "
                f"{month_name} {year}"
            )
            continue

        # ==================================
        # BILL CALCULATIONS
        # ==================================

        if sheet == "Electricity":
            base = get("Base Bill")
            society = get("Society Charges")
            credit = get("Credit")
            late = 0.0

            total = max(
                0.0,
                base + society - credit
            )

        elif sheet == "Gas":
            positive_components = [
                "Gas Charges",
                "Previous Bill Adjustment",
                "Meter Rent",
                "Fixed Charges",
                "GST",
                "Security Deposit",
                "Arrears",
            ]

            base = (
                sum(get(c) for c in positive_components)
                - get("Rebate")
            )

            society = 0.0
            credit = 0.0
            late = 0.0
            total = base

        else:
            # Simplified Water spreadsheet
            base = get("Base Bill")
            other = get("Other Charges")

            society = 0.0
            credit = 0.0
            late = 0.0

            total = base + other

        # ==================================
        # CONSUMPTION AND UNIT PRICES
        # ==================================

        units_value = row.get(
            UNITS_COLUMNS[sheet]
        )

        units = (
            None
            if pd.isna(units_value)
            else float(units_value)
        )

        # Effective price per unit
        price_per_unit = (
            round(total / units, 4)
            if units is not None and units > 0
            else None
        )

        # Solar exported units
        exported_value = (
            row.get("Exported Units")
            if sheet == "Electricity"
            else None
        )

        exported_units = (
            None
            if pd.isna(exported_value)
            else float(exported_value)
        )

        # ==================================
        # BILL ID
        # ==================================

        bill_id = row.get("Bill ID")

        if pd.isna(bill_id) or str(bill_id).strip() == "":
            bill_id = (
                f"{PREFIXES[sheet]}-"
                f"{year}-{month_number:02d}"
            )

        # ==================================
        # DETAILED CHARGES
        # ==================================

        charges = {
            column: round(get(column), 2)
            for column in CHARGE_COLUMNS[sheet]
        }

        # ==================================
        # SAVE BILL RECORD
        # ==================================

        records.append({
            "id": str(bill_id),
            "utility": sheet,
            "year": year,
            "month": month_name,
            "month_number": month_number,
            "period": f"{year}-{month_number:02d}",

            "units": units,
            "price_per_unit": price_per_unit,

            "exported_units": exported_units,
            "credit": round(credit, 2),

            "base_bill": round(base, 2),
            "society_charges": round(society, 2),
            "late_surcharge": round(late, 2),
            "total_bill": round(total, 2),

            "charges": charges,
        })

    return records


# ==========================================
# MONTHLY SUMMARY
# ==========================================

def create_summary(records):
    monthly = {}

    for record in records:
        period = record["period"]

        if period not in monthly:
            monthly[period] = {
                "period": period,
                "year": record["year"],
                "month": record["month"],
                "Electricity": 0,
                "Gas": 0,
                "Water": 0,
                "total": 0,
            }

        amount = record["total_bill"]

        monthly[period][record["utility"]] += amount
        monthly[period]["total"] += amount

    return [
        {
            **item,
            "total": round(item["total"], 2)
        }
        for item in sorted(
            monthly.values(),
            key=lambda x: x["period"]
        )
    ]


# ==========================================
# MAIN PROCESS
# ==========================================

def main():

    if not EXCEL.exists():
        raise FileNotFoundError(
            f"Workbook not found: {EXCEL}"
        )

    all_records = []

    for sheet in SHEETS:
        records = read_utility(sheet)
        all_records.extend(records)

        print(
            f"{sheet}: {len(records)} bills loaded"
        )

    summary = create_summary(all_records)

    result = {
        "project": "81E Home Analytics",
        "currency": "PKR",
        "bills": all_records,
        "monthly_summary": summary,
    }

    OUTPUT.write_text(
        json.dumps(result, indent=2),
        encoding="utf-8"
    )

    print(
        f"\nTotal bills: {len(all_records)}"
    )

    print(
        f"Monthly periods: {len(summary)}"
    )

    print(
        f"JSON created: {OUTPUT}"
    )


if __name__ == "__main__":
    main()
