// Declarative Jenkins pipeline for DJ-TECH.
// Mirrors .github/workflows/ci.yml for self-hosted Jenkins.
pipeline {
    agent any

    tools {
        nodejs 'nodejs'
    }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        // Use DATA_DIR in /tmp so builds don't touch the workspace DB.
        DATA_DIR = "${WORKSPACE_TMP}/djtech-data"
        NODE_ENV = 'production'
    }

    stages {
        stage('Install') {
            steps {
                script {
                    if (sh(script: 'command -v bun', returnStatus: true) == 0) {
                        echo 'Using bun'
                        sh 'bun install --frozen-lockfile'
                    } else {
                        echo 'bun not found, using npm'
                        sh 'npm install'
                    }
                }
            }
        }

        stage('Lint') {
            steps {
                script {
                    if (sh(script: 'command -v bun', returnStatus: true) == 0) {
                        sh 'bun run lint'
                    } else {
                        sh 'npm run lint'
                    }
                }
            }
        }

        stage('Build') {
            steps {
                script {
                    if (sh(script: 'command -v bun', returnStatus: true) == 0) {
                        sh 'bun run build'
                    } else {
                        sh 'npm run build'
                    }
                }
                stash name: 'dist', includes: 'dist/**'
            }
        }

        stage('Test') {
            steps {
                script {
                    if (fileExists('scripts/test-documents.mjs')) {
                        sh 'node scripts/test-documents.mjs'
                    } else {
                        echo 'No test script present, skipping'
                    }
                }
            }
        }

        stage('Docker') {
            when {
                // Only build an image when Docker is available on the agent.
                expression { sh(script: 'command -v docker', returnStatus: true) == 0 }
            }
            steps {
                script {
                    def ver = sh(
                        script: "node -p \"require('./package.json').version\"",
                        returnStdout: true
                    ).trim()
                    def img = "ghcr.io/coff33ninja/dj-tech:${ver}"
                    sh "docker build -t ${img} ."
                    echo "Built image ${img}"
                    // Push to GHCR only when the ghcr-registry-token credential
                    // exists in Jenkins; otherwise the build stays local-only.
                    try {
                        withCredentials([usernamePassword(
                            credentialsId: 'ghcr-registry-token',
                            usernameVariable: 'GHCR_USER',
                            passwordVariable: 'GHCR_PASS'
                        )]) {
                            sh 'echo "$GHCR_PASS" | docker login ghcr.io -u "$GHCR_USER" --password-stdin'
                            sh "docker push ${img}"
                            echo "Pushed ${img}"
                        }
                    } catch (e) {
                        echo "Push skipped (no ghcr-registry-token credential): ${e}"
                    }
                }
            }
        }
    }

    post {
        success {
            echo 'DJ-TECH pipeline succeeded.'
        }
        failure {
            echo 'DJ-TECH pipeline failed.'
        }
    }
}
