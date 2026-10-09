package com.medilink.ai.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * Dedicated manager class for handling all Health Connect API operations:
 * - Availability checks
 * - Permission verification
 * - Heart Rate reading with origin device detection
 * - Steps aggregation with origin device detection
 * - Exception and error handling
 */
class HealthConnectManager(private val context: Context) {

    // Set of required Health Connect permissions for MediLink AI prototype
    val requiredPermissions: Set<String> = setOf(
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class)
    )

    /**
     * Creates ActivityResultContract for requesting Health Connect permissions.
     */
    fun healthConnectClientContract() = PermissionController.createRequestPermissionResultContract()

    /**
     * Checks current Health Connect SDK availability status.
     * Returns true if available, false otherwise.
     */
    fun isAvailable(): Boolean {
        return HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
    }

    /**
     * Returns detailed availability status code.
     */
    fun getSdkStatus(): Int {
        return HealthConnectClient.getSdkStatus(context)
    }

    /**
     * Returns an instance of HealthConnectClient or null if unavailable.
     */
    private fun getClient(): HealthConnectClient? {
        return if (isAvailable()) {
            HealthConnectClient.getOrCreate(context)
        } else {
            null
        }
    }

    /**
     * Checks whether all required Health Connect permissions have been granted.
     */
    suspend fun hasAllPermissions(): Boolean {
        val client = getClient() ?: return false
        return try {
            val grantedPermissions = client.permissionController.getGrantedPermissions()
            grantedPermissions.containsAll(requiredPermissions)
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Maps Health Connect package names to user-friendly Smartwatch / Provider brand names.
     */
    private fun getFriendlyOriginName(packageName: String): String {
        return when {
            packageName.contains("sec.android.app.shealth") -> "Samsung Galaxy Watch"
            packageName.contains("fitbit") -> "Fitbit Smartwatch"
            packageName.contains("google.android.apps.fitness") -> "Wear OS / Google Fit"
            packageName.contains("garmin") -> "Garmin Watch"
            packageName.contains("huawei") -> "Huawei Health Watch"
            packageName.contains("amazfit") || packageName.contains("zepp") -> "Amazfit / Zepp Watch"
            packageName.contains("toolbox") -> "Health Connect Simulator"
            else -> packageName
        }
    }

    /**
     * Reads the latest Heart Rate record available in Health Connect from the last 7 days.
     * Returns Triple of (BPM, FormattedTimestamp, DeviceName) or null if no data exists.
     */
    suspend fun readLatestHeartRate(): Triple<Long, String, String>? {
        val client = getClient() ?: return null
        return try {
            val startTime = Instant.now().minus(7, ChronoUnit.DAYS)
            val endTime = Instant.now()

            val request = ReadRecordsRequest(
                recordType = HeartRateRecord::class,
                timeRangeFilter = TimeRangeFilter.between(startTime, endTime)
            )

            val response = client.readRecords(request)

            val latestSample = response.records
                .flatMap { record ->
                    val pkg = record.metadata.dataOrigin.packageName
                    record.samples.map { sample -> Triple(sample, sample.time, pkg) }
                }
                .maxByOrNull { it.second }

            latestSample?.let { (sample, time, pkg) ->
                val formatter = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a", Locale.getDefault())
                    .withZone(ZoneId.systemDefault())
                val formattedTime = formatter.format(time)
                val deviceName = getFriendlyOriginName(pkg)
                Triple(sample.beatsPerMinute, formattedTime, deviceName)
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Aggregates total step count for today (from 00:00:00 local time until now)
     * and detects the origin watch/app package name.
     */
    suspend fun readTodaySteps(): Triple<Long, String, String>? {
        val client = getClient() ?: return null
        return try {
            val startOfDay = ZonedDateTime.now().truncatedTo(ChronoUnit.DAYS).toInstant()
            val now = Instant.now()

            val response = client.aggregate(
                AggregateRequest(
                    metrics = setOf(StepsRecord.COUNT_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(startOfDay, now)
                )
            )

            val totalSteps = response[StepsRecord.COUNT_TOTAL]

            // Inspect records to extract origin watch/app package
            val stepRecords = client.readRecords(
                ReadRecordsRequest(
                    recordType = StepsRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(startOfDay, now)
                )
            )
            val originPkg = stepRecords.records.maxByOrNull { it.endTime }?.metadata?.dataOrigin?.packageName
            val deviceName = originPkg?.let { getFriendlyOriginName(it) } ?: "Health Connect"

            totalSteps?.let { steps ->
                val formatter = DateTimeFormatter.ofPattern("hh:mm a", Locale.getDefault())
                    .withZone(ZoneId.systemDefault())
                val formattedTime = formatter.format(now)
                Triple(steps, "Today (as of $formattedTime)", deviceName)
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Reads all health data (Heart Rate & Steps) and constructs the HealthData payload with origin metadata.
     */
    suspend fun fetchHealthData(): HealthData {
        val hrResult = readLatestHeartRate()
        val stepsResult = readTodaySteps()

        val mainSource = hrResult?.third ?: stepsResult?.third ?: "Health Connect"

        return HealthData(
            heartRate = hrResult?.first,
            heartRateTimestamp = hrResult?.second,
            heartRateDevice = hrResult?.third,
            steps = stepsResult?.first,
            stepsDate = stepsResult?.second ?: "Today",
            stepsDevice = stepsResult?.third,
            dataSource = mainSource
        )
    }
}
