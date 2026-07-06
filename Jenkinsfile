pipeline {
  agent any

  tools {
    nodejs 'NodeJS-20' 
  }

  environment {
    IMAGE_NAME = 'nocryptify_frontend'
    NGINX_CONF_DIR = '/home/ubuntu/secret-notes/nginx'
    
    STAGING_EC2_USER = "${env.STAGING_EC2_USER}"
    STAGING_EC2_HOST = "${env.STAGING_EC2_HOST}"
    STAGING_URL      = "${env.STAGING_URL}"
    VITE_API_URL     = "${env.VITE_API_URL}"
    
    DOCKERHUB_CREDENTIALS = credentials('dockerhub')
    SONAR_TOKEN = credentials('sonarqube-token')
    SNYK_TOKEN = credentials('snyk-token')
    DISCORD_WEBHOOK = credentials('discord-webhook-url')
    
    SCANNER_HOME = tool 'SonarScanner'
  }

  stages {
    stage('Debug Info') {
      steps {
        echo "-> Aktueller GIT_BRANCH: ${env.GIT_BRANCH}"
      }
    }
    
    stage('Lint & Sec') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh 'npx snyk auth "$SNYK_TOKEN"'
        sh 'npx snyk test --severity-threshold=high || true'
        sh 'npx snyk monitor --project-name="${IMAGE_NAME}" || true'
        
        sh '"$SCANNER_HOME/bin/sonar-scanner" -Dsonar.host.url="$SONAR_HOST_URL" -Dsonar.token="$SONAR_TOKEN" || true'
      }
    }

    stage('Test') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh 'npm ci'
        sh 'npm test -- --coverage'
      }
    }

    stage('Build') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh "docker build -t ${IMAGE_NAME}:${env.GIT_COMMIT} --build-arg VITE_API_URL=${VITE_API_URL} ."
      }
    }

    stage('Deliver') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        sh '''
          echo "$DOCKERHUB_CREDENTIALS_PSW" | docker login -u "$DOCKERHUB_CREDENTIALS_USR" --password-stdin
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT"
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:latest"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:latest"
        '''
      }
    }

    stage('Deploy to Staging') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        sshagent(credentials: ['app-ec2-ssh-key']) {
          sh '''
            # 1. Aktuelle Farbe vom Server auslesen (Fallback auf 'blue', falls Datei fehlt)
            PROD_COLOR=$(ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "cat /home/ubuntu/secret-notes/frontend-prod.colour 2>/dev/null || echo 'blue'")

            # 2. Ziel-Container bestimmen
            if [ "$PROD_COLOR" = "blue" ]; then
              TARGET_ENV="frontend-green"
            else
              TARGET_ENV="frontend-blue"
            fi

            echo "Production ist aktuell: $PROD_COLOR. Deploye neue Version auf: $TARGET_ENV..."

            # 3. Neuen Container auf dem Server starten
            ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "
              docker login -u $DOCKERHUB_CREDENTIALS_USR -p $DOCKERHUB_CREDENTIALS_PSW
              docker pull $DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT
              
              docker stop $TARGET_ENV || true
              docker rm $TARGET_ENV || true
              
              docker run -d \\
                --name $TARGET_ENV \\
                --network network \\
                --restart unless-stopped \\
                $DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT
            "
          '''
        }
      }
    }

    stage('E2E, Performance & Switch Traffic') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        sh 'sleep 10'
        
        echo "Running E2E Tests with Playwright..."
        docker run --rm \\
            -v "${WORKSPACE}:/work" \\
            -w /work \\
            -e STAGING_URL="${STAGING_URL}" \\
            mcr.microsoft.com/playwright:v1.40.0-jammy \\
            /bin/bash -c "npm ci && npx playwright test tests/e2e/app.spec.ts"
        
        echo "Running Performance Tests with k6..."
        sh 'docker run --rm -i -e STAGING_URL=${STAGING_URL} grafana/k6 run - < tests/performance/load.js'

        sshagent(credentials: ['app-ec2-ssh-key']) {
          sh '''
            echo "Tests successful! Swapping config on host and reloading NGINX proxy..."

            ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST << 'EOF'
              
              COLOR_FILE="/home/ubuntu/secret-notes/frontend-prod.colour"
              CONF_FILE="/home/ubuntu/secret-notes/nginx/targets/frontend.conf"
              
              # Verzeichnis zur Sicherheit anlegen
              mkdir -p /home/ubuntu/secret-notes/nginx/targets

              # Status lesen
              if [ -f "$COLOR_FILE" ]; then
                PROD_COLOR=$(cat "$COLOR_FILE")
              else
                PROD_COLOR="blue"
              fi

              # Umschalt-Logik
              if [ "$PROD_COLOR" = "blue" ]; then
                NEW_PROD="green"
                NEW_STAGING="blue"
              else
                NEW_PROD="blue"
                NEW_STAGING="green"
              fi

              echo "Umschalten: $NEW_PROD wird Production, $NEW_STAGING wird Staging."

              # Die kugelsichere Schreibweise ohne Backslash-Probleme:
              echo 'set $frontend_production http://frontend-'"$NEW_PROD"':80;' > "$CONF_FILE"
              echo 'set $frontend_staging http://frontend-'"$NEW_STAGING"':80;' >> "$CONF_FILE"
              
              echo "$NEW_PROD" > "$COLOR_FILE"

              # NGINX neu laden
              docker exec proxy nginx -s reload
EOF
          '''
        }
      }
    }
  }

  post {
    failure {
      sh '''
        if [ -n "$DISCORD_WEBHOOK" ]; then
          curl -H "Content-Type: application/json" \
            -X POST \
            -d "{\\"content\\": \\"<@&1522970703245348995> ❌ **${JOB_NAME} #${BUILD_NUMBER}** failed on branch **${BRANCH_NAME}**!\\\\nDetails: ${BUILD_URL}\\"}" \
            "$DISCORD_WEBHOOK"
        fi
      '''
    }
  }
}