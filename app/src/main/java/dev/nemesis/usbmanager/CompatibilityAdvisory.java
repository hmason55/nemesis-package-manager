package dev.nemesis.usbmanager;

/** Informational matching only: exact values or '*' wildcards, never version ranges. */
final class CompatibilityAdvisory {
    private CompatibilityAdvisory() { }
    static String assess(String[] declared, String known) {
        if (declared == null || declared.length == 0) return "Unknown: publisher has not declared support";
        for (String value : declared) if (value.trim().equals("*")) return "Match: unrestricted";
        if (known == null || known.trim().length() == 0) return "Unknown: device value is not configured";
        boolean informational = false;
        for (String value : declared) {
            String expression = value.trim();
            if (expression.equalsIgnoreCase(known.trim())) return "Match: " + known.trim();
            if (expression.length() == 0 || expression.equalsIgnoreCase("x") || expression.matches(".*[<>+=*].*") || expression.matches("(?i).*\\b[0-9]+\\.x\\b.*")) informational = true;
        }
        if (informational) return "Unknown: publisher declaration is informational; compare it manually";
        return "Warning: " + known.trim() + " does not match declared support";
    }
    static String status(PackageRecord record, String vehicle, String firmware, String nemesis) {
        String[] values = { assess(record.vehicles, vehicle), assess(record.firmware, firmware),
            assess(record.nemesisSupport == null || record.nemesisSupport.trim().length() == 0 ? new String[0] : new String[] {record.nemesisSupport}, nemesis) };
        boolean unknown = false;
        for (String value : values) {
            if (value.startsWith("Warning")) return "mismatch";
            if (value.startsWith("Unknown")) unknown = true;
        }
        return unknown ? "unknown" : "match";
    }
    static String describe(PackageRecord record, String vehicle, String firmware, String nemesis) {
        return "Compatibility check (advisory)\nVehicle: " + assess(record.vehicles, vehicle) +
            "\nFirmware: " + assess(record.firmware, firmware) + "\nNEMESIS: " +
            assess(record.nemesisSupport == null || record.nemesisSupport.trim().length() == 0 ? new String[0] : new String[] {record.nemesisSupport}, nemesis) +
            "\n\nExact values and an unrestricted * are compared, ignoring case. Version ranges and other text are displayed literally. " +
            "A match is not a guarantee of support. Missing information or a mismatch never blocks installation.";
    }
}
