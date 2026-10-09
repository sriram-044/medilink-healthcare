package com.medilink.ai.health

/**
 * Data model representing patient health metrics read from Health Connect.
 * Includes origin metadata (smartwatch/app provider name) for live connection demonstration.
 */
data class HealthData(
    val heartRate: Long? = null,
    val heartRateTimestamp: String? = null,
    val heartRateDevice: String? = null,
    val steps: Long? = null,
    val stepsDate: String? = null,
    val stepsDevice: String? = null,
    val dataSource: String = "Health Connect"
)

/**
 * Sealed interface representing all explicit UI states of the MediLink AI application.
 */
sealed interface HealthUiState {
    object Loading : HealthUiState
    data class HealthConnectUnavailable(val message: String = "Health Connect is not available on this device.") : HealthUiState
    object PermissionRequired : HealthUiState
    data class PermissionDenied(val message: String = "Health data permission was denied.") : HealthUiState
    data class Success(val data: HealthData, val isRefreshing: Boolean = false) : HealthUiState
    data class Error(val message: String) : HealthUiState
}
